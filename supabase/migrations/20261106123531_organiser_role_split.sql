-- Split event creation, event operations, and category oversight into distinct roles.

alter table public.staff_assignments
  add column if not exists event_category public.event_category;

alter table public.events
  add column if not exists created_by uuid references public.profiles(id) on delete set null;

alter table public.staff_assignments drop constraint if exists staff_assignments_check;

-- Preserve existing authority without guessing category-wide ownership.
update public.staff_assignments set role = 'event_editor'
where role = 'event_coordinator' and event_id is null;

update public.staff_assignments set role = 'event_coordinator'
where role = 'event_head' and event_id is not null;

alter table public.staff_assignments add constraint staff_assignments_scope_check check (
  (role = 'event_coordinator' and event_id is not null and event_category is null)
  or (role = 'event_head' and event_id is null and event_category is not null)
  or (role not in ('event_coordinator', 'event_head') and event_id is null and event_category is null)
);

drop index if exists public.active_global_staff_assignment;
drop index if exists public.active_event_head_assignment;
create unique index if not exists active_global_staff_assignment
  on public.staff_assignments(profile_id, role)
  where revoked_at is null and event_id is null and event_category is null;
create unique index if not exists active_event_coordinator_assignment
  on public.staff_assignments(profile_id, event_id)
  where revoked_at is null and role = 'event_coordinator';
create unique index if not exists active_event_head_category_assignment
  on public.staff_assignments(profile_id, event_category)
  where revoked_at is null and role = 'event_head';

create or replace function public.can_create_events()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      public.has_active_festival_access()
      and exists (
        select 1 from public.staff_assignments sa
        where sa.profile_id = auth.uid()
          and sa.role in ('main_admin', 'event_editor')
          and sa.revoked_at is null
      )
    );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or exists (
      select 1
      from public.events e
      join public.access_records ar
        on ar.edition_id = e.edition_id
       and ar.profile_id = auth.uid()
       and ar.state = 'active'
      join public.staff_assignments sa
        on sa.profile_id = auth.uid()
       and sa.revoked_at is null
      where e.id = p_event_id
        and (
          sa.role = 'main_admin'
          or (sa.role = 'event_coordinator' and sa.event_id = e.id)
          or (sa.role = 'event_head' and sa.event_category = e.category)
        )
    );
$$;

create or replace function public.can_edit_event_definition(p_event_id uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or exists (
      select 1
      from public.events e
      join public.access_records ar
        on ar.edition_id = e.edition_id
       and ar.profile_id = auth.uid()
       and ar.state = 'active'
      join public.staff_assignments sa
        on sa.profile_id = auth.uid()
       and sa.revoked_at is null
      where e.id = p_event_id
        and (sa.role = 'main_admin' or (sa.role = 'event_editor' and e.created_by = auth.uid()))
    );
$$;

drop function if exists public.list_admin_event_editor_data();
create function public.list_admin_event_editor_data()
returns table (
  event_id uuid, title text, category public.event_category,
  format public.event_format, score_template text, state public.event_state,
  summary text, rules_markdown text, venue text,
  application_capacity integer, waitlist_enabled boolean,
  application_opens_at timestamptz, application_closes_at timestamptz,
  roster_lock_at timestamptz, reporting_at timestamptz,
  starts_at timestamptz, ends_at timestamptz,
  eligibility jsonb, application_questions jsonb,
  group_min_size integer, group_max_size integer, batch_restricted boolean,
  poster_url text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.category, e.format, e.score_template, e.state,
    e.summary, e.rules_markdown, e.venue,
    e.application_capacity, e.waitlist_enabled,
    e.application_opens_at, e.application_closes_at,
    e.roster_lock_at, e.reporting_at, e.starts_at, e.ends_at,
    e.eligibility, e.application_questions,
    e.group_min_size, e.group_max_size, e.batch_restricted, e.poster_url
  from public.events e
  where public.can_edit_event_definition(e.id)
  order by e.title;
$$;

create or replace function public.create_admin_event(
  p_edition_id uuid,
  p_title text,
  p_category public.event_category,
  p_format public.event_format,
  p_score_template text,
  p_summary text default '',
  p_venue text default null,
  p_application_capacity integer default null,
  p_application_opens_at timestamptz default null,
  p_application_closes_at timestamptz default null,
  p_reporting_at timestamptz default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_division text default 'open'
)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  created public.events;
  generated_slug text;
  edition public.editions;
  caller_is_admin boolean;
begin
  caller_is_admin := public.is_main_admin();
  if auth.uid() is null or not public.can_create_events() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into edition from public.editions where id = p_edition_id;
  if not found then raise exception 'Festival edition not found' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if p_score_template not in ('generic', 'cricket', 'football', 'badminton', 'basketball', 'set_based') then raise exception 'Invalid score template' using errcode = '22023'; end if;
  if p_division not in ('boys', 'girls', 'open') then raise exception 'Invalid event division' using errcode = '22023'; end if;
  generated_slug := trim(both '-' from regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then raise exception 'Event title needs letters or numbers' using errcode = '22023'; end if;

  insert into public.events (
    edition_id, title, slug, category, format, score_template, summary, venue,
    application_capacity, application_opens_at, application_closes_at, starts_at,
    state, eligibility, created_by
  ) values (
    p_edition_id, btrim(p_title), generated_slug, p_category, p_format,
    p_score_template, btrim(p_summary), nullif(btrim(p_venue), ''),
    p_application_capacity, edition.registration_opens_at, edition.registration_closes_at,
    p_starts_at, case when caller_is_admin then 'open'::public.event_state else 'draft'::public.event_state end,
    jsonb_build_object('division', p_division), auth.uid()
  ) returning * into created;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), case when caller_is_admin then 'event.created' else 'event.proposed_by_editor' end,
    'event', created.id, jsonb_build_object('edition_id', p_edition_id, 'slug', created.slug, 'state', created.state));
  return created;
end;
$$;

drop function if exists public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean);
create or replace function public.update_admin_event_full(
  p_event_id uuid, p_title text, p_summary text, p_rules_markdown text, p_venue text,
  p_application_capacity integer, p_waitlist_enabled boolean, p_application_opens_at timestamptz,
  p_application_closes_at timestamptz, p_roster_lock_at timestamptz, p_reporting_at timestamptz,
  p_starts_at timestamptz, p_ends_at timestamptz, p_eligibility jsonb,
  p_application_questions jsonb, p_group_min_size integer, p_group_max_size integer,
  p_batch_restricted boolean, p_poster_url text default null
)
returns public.events language plpgsql security definer set search_path = public as $$
declare updated public.events; global_opens_at timestamptz; global_closes_at timestamptz; cleaned_questions jsonb;
begin
  if auth.uid() is null or not public.can_edit_event_definition(p_event_id) then raise exception 'Not authorised' using errcode = '42501'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_summary)), 0) > 600 then raise exception 'Summary must be at most 600 characters' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_rules_markdown)), 0) > 20000 then raise exception 'Rules content is too long' using errcode = '22023'; end if;
  if p_group_min_size is not null and p_group_max_size is not null and p_group_max_size < p_group_min_size then raise exception 'Group max size must be at least min size' using errcode = '22023'; end if;
  if p_application_questions is not null and jsonb_typeof(p_application_questions) <> 'array' then raise exception 'Application questions must be a JSON array' using errcode = '22023'; end if;
  if p_eligibility is not null and jsonb_typeof(p_eligibility) <> 'object' then raise exception 'Eligibility must be a JSON object' using errcode = '22023'; end if;
  if lower(coalesce(p_eligibility->>'division', 'open')) not in ('boys', 'girls', 'open') then raise exception 'Invalid event division' using errcode = '22023'; end if;
  select ed.registration_opens_at, ed.registration_closes_at into global_opens_at, global_closes_at
    from public.events e join public.editions ed on ed.id = e.edition_id where e.id = p_event_id;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(question), '[]'::jsonb) into cleaned_questions
    from jsonb_array_elements(coalesce(p_application_questions, '[]'::jsonb)) question
    where lower(coalesce(question->>'key', '') || ' ' || coalesce(question->>'label', '')) !~ '(roll|batch|full[ _-]?name|phone|mobile|gender|sex)';
  update public.events set title=btrim(p_title), summary=btrim(p_summary), rules_markdown=btrim(p_rules_markdown),
    venue=nullif(btrim(p_venue), ''), application_capacity=p_application_capacity,
    waitlist_enabled=coalesce(p_waitlist_enabled, false), application_opens_at=global_opens_at,
    application_closes_at=global_closes_at, roster_lock_at=null, reporting_at=null,
    starts_at=p_starts_at, ends_at=null, eligibility=coalesce(p_eligibility, '{}'::jsonb),
    application_questions=cleaned_questions, group_min_size=p_group_min_size,
    group_max_size=p_group_max_size, batch_restricted=coalesce(p_batch_restricted, false),
    poster_url=nullif(btrim(p_poster_url), '') where id=p_event_id returning * into updated;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
    values (auth.uid(), 'event.full_updated', 'event', updated.id, jsonb_build_object('title', updated.title, 'state', updated.state));
  return updated;
end;
$$;

create or replace function public.delete_owned_event(p_event_id uuid)
returns text[] language plpgsql security definer set search_path = public as $$
declare event_record public.events; gallery_paths text[];
begin
  if auth.uid() is null or not public.can_edit_event_definition(p_event_id) then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into event_record from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  select coalesce(array_agg(storage_path), '{}'::text[]) into gallery_paths
    from public.gallery_moments where event_id = event_record.id;
  delete from public.gallery_moments where event_id = event_record.id;
  delete from public.points_ledger where publication_id in (select id from public.result_publications where event_id = event_record.id);
  delete from public.result_publications where event_id = event_record.id;
  delete from public.participant_groups where event_id = event_record.id;
  delete from public.applications where event_id = event_record.id;
  delete from public.events where id = event_record.id;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
    values (auth.uid(), 'event.deleted', 'event', event_record.id, jsonb_build_object('title', event_record.title));
  return gallery_paths;
end;
$$;

drop function if exists public.list_committee_members();
create function public.list_committee_members()
returns table (
  assignment_id uuid, profile_id uuid, full_name text, fest_id text, batch_label text,
  role public.staff_role, event_id uuid, event_title text, event_category public.event_category, granted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, p.id, p.full_name, p.fest_id, b.label, s.role, s.event_id, e.title, s.event_category, s.granted_at
  from public.staff_assignments s
  join public.profiles p on p.id = s.profile_id
  join public.batches b on b.id = p.batch_id
  left join public.events e on e.id = s.event_id
  where s.revoked_at is null and public.is_main_admin()
  order by p.full_name, s.role, e.title nulls first, s.event_category nulls first;
$$;

drop function if exists public.assign_committee_role(uuid, public.staff_role, uuid);
create function public.assign_committee_role(
  p_profile_id uuid, p_role public.staff_role, p_event_id uuid default null,
  p_event_category public.event_category default null
)
returns public.staff_assignments language plpgsql security definer set search_path = public as $$
declare assignment public.staff_assignments;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  if not exists (
    select 1 from public.profiles p join public.batches b on b.id=p.batch_id join public.access_records ar on ar.profile_id=p.id
    where p.id=p_profile_id and ar.state='active' and b.label='2023'
  ) then raise exception 'App controllers must be active students from the 2023 batch' using errcode='22023'; end if;
  if (p_role = 'event_coordinator') <> (p_event_id is not null) then raise exception 'Event Coordinators require exactly one event' using errcode='22023'; end if;
  if (p_role = 'event_head') <> (p_event_category is not null) then raise exception 'Event Heads require exactly one category' using errcode='22023'; end if;
  if p_role not in ('event_coordinator', 'event_head') and (p_event_id is not null or p_event_category is not null) then raise exception 'This role does not use an event scope' using errcode='22023'; end if;
  if p_event_id is not null and not exists (select 1 from public.events where id=p_event_id) then raise exception 'Event not found' using errcode='22023'; end if;
  insert into public.staff_assignments(profile_id, role, event_id, event_category, granted_by)
    values(p_profile_id, p_role, p_event_id, p_event_category, auth.uid()) returning * into assignment;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
    values(auth.uid(), 'committee.role_granted', 'staff_assignment', assignment.id,
      jsonb_build_object('role', p_role, 'profile_id', p_profile_id, 'event_id', p_event_id, 'event_category', p_event_category));
  return assignment;
end;
$$;

create or replace function public.can_manage_live_desk()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_main_admin();
$$;

revoke all on function public.can_create_events() from public, anon;
revoke all on function public.can_manage_event(uuid) from public, anon;
revoke all on function public.can_edit_event_definition(uuid) from public, anon;
revoke all on function public.list_admin_event_editor_data() from public, anon;
revoke all on function public.create_admin_event(uuid,text,public.event_category,public.event_format,text,text,text,integer,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text) from public, anon;
revoke all on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) from public, anon;
revoke all on function public.delete_owned_event(uuid) from public, anon;
revoke all on function public.list_committee_members() from public, anon;
revoke all on function public.assign_committee_role(uuid,public.staff_role,uuid,public.event_category) from public, anon;
revoke all on function public.can_manage_live_desk() from public, anon;
grant execute on function public.can_create_events() to authenticated, service_role;
grant execute on function public.can_manage_event(uuid) to authenticated, service_role;
grant execute on function public.can_edit_event_definition(uuid) to authenticated, service_role;
grant execute on function public.list_admin_event_editor_data() to authenticated, service_role;
grant execute on function public.create_admin_event(uuid,text,public.event_category,public.event_format,text,text,text,integer,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,text) to authenticated, service_role;
grant execute on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) to authenticated, service_role;
grant execute on function public.delete_owned_event(uuid) to authenticated, service_role;
grant execute on function public.list_committee_members() to authenticated, service_role;
grant execute on function public.assign_committee_role(uuid,public.staff_role,uuid,public.event_category) to authenticated, service_role;
grant execute on function public.can_manage_live_desk() to authenticated, service_role;

notify pgrst, 'reload schema';

