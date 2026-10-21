-- Option B: Event Coordinators & Proposal Approval Workflow
-- 1. Add 'event_coordinator' to public.staff_role enum.
-- 2. Provide helper functions: is_event_coordinator(), can_create_events().
-- 3. Allow event coordinators to view editions and manage their own events.
-- 4. Enable event coordinators to create events: created events start in 'draft' state
--    and assign the creator as 'event_head' automatically.
-- 5. Enable event heads/coordinators to update event content/questions/posters for their assigned event.
-- 6. Main Admin retains exclusive authority to approve/publish events ('open' / 'published') and set global windows.

alter type public.staff_role add value if not exists 'event_coordinator';

-- Helper: can the current user create/propose events?
create or replace function public.can_create_events()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.staff_assignments
    where profile_id = auth.uid()
      and role in ('main_admin', 'event_coordinator', 'event_head')
      and revoked_at is null
  );
$$;

revoke all on function public.can_create_events() from public, anon;
grant execute on function public.can_create_events() to authenticated;

-- Allow coordinators to read festival editions so they can create events inside an edition
drop function if exists public.list_admin_editions();
create function public.list_admin_editions()
returns table (
  edition_id uuid, name text, starts_on date, ends_on date, status text,
  registration_opens_at timestamptz, registration_closes_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.starts_on, e.ends_on, e.status,
    e.registration_opens_at, e.registration_closes_at
  from public.editions e
  where public.is_main_admin() or public.can_create_events()
  order by e.starts_on nulls last, e.created_at desc;
$$;

revoke all on function public.list_admin_editions() from public, anon;
grant execute on function public.list_admin_editions() to authenticated;

-- Event editor list: Main Admin sees ALL events; Coordinators/Event Heads see ONLY their assigned events
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
  select
    e.id, e.title, e.category, e.format, e.score_template, e.state,
    e.summary, e.rules_markdown, e.venue,
    e.application_capacity, e.waitlist_enabled,
    e.application_opens_at, e.application_closes_at,
    e.roster_lock_at, e.reporting_at, e.starts_at, e.ends_at,
    e.eligibility, e.application_questions,
    e.group_min_size, e.group_max_size, e.batch_restricted,
    e.poster_url
  from public.events e
  where public.is_main_admin() or public.can_manage_event(e.id)
  order by e.title;
$$;

revoke all on function public.list_admin_event_editor_data() from public, anon;
grant execute on function public.list_admin_event_editor_data() to authenticated;

-- create_admin_event: Main Admin creates 'open' events; Coordinators create 'draft' events pending review.
drop function if exists public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text);
create function public.create_admin_event(
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
  initial_state public.event_state;
begin
  caller_is_admin := public.is_main_admin();
  if auth.uid() is null or not (caller_is_admin or public.can_create_events()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into edition from public.editions where id = p_edition_id;
  if not found then raise exception 'Festival edition not found' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if p_score_template not in ('generic', 'cricket', 'football', 'badminton') then raise exception 'Invalid score template' using errcode = '22023'; end if;
  if p_division not in ('boys', 'girls', 'open') then raise exception 'Invalid event division' using errcode = '22023'; end if;

  generated_slug := trim(both '-' from regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then raise exception 'Event title needs letters or numbers' using errcode = '22023'; end if;

  -- Option B: Main Admin creates open event directly; Coordinator creates draft event
  if caller_is_admin then
    initial_state := 'open'::public.event_state;
  else
    initial_state := 'draft'::public.event_state;
  end if;

  insert into public.events (
    edition_id, title, slug, category, format, score_template, summary, venue,
    application_capacity, application_opens_at, application_closes_at,
    starts_at, state, eligibility
  ) values (
    p_edition_id, btrim(p_title), generated_slug, p_category, p_format,
    p_score_template, btrim(p_summary), nullif(btrim(p_venue), ''),
    p_application_capacity, edition.registration_opens_at, edition.registration_closes_at,
    p_starts_at, initial_state, jsonb_build_object('division', p_division)
  ) returning * into created;

  -- Automatically assign the creator as event_head for this event
  insert into public.staff_assignments (profile_id, role, event_id, granted_by)
  values (auth.uid(), 'event_head', created.id, auth.uid())
  on conflict do nothing;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (
    auth.uid(),
    case when caller_is_admin then 'event.created' else 'event.proposed_by_coordinator' end,
    'event',
    created.id,
    jsonb_build_object('edition_id', p_edition_id, 'slug', created.slug, 'state', created.state, 'creator', auth.uid())
  );

  return created;
end;
$$;

revoke all on function public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text) to authenticated;

-- update_admin_event_full: Authorize both Main Admin and assigned Event Coordinators/Heads
create or replace function public.update_admin_event_full(
  p_event_id uuid,
  p_title text,
  p_summary text,
  p_rules_markdown text,
  p_venue text,
  p_application_capacity integer,
  p_waitlist_enabled boolean,
  p_application_opens_at timestamptz,
  p_application_closes_at timestamptz,
  p_roster_lock_at timestamptz,
  p_reporting_at timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_eligibility jsonb,
  p_application_questions jsonb,
  p_group_min_size integer,
  p_group_max_size integer,
  p_batch_restricted boolean,
  p_poster_url text default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.events;
  global_opens_at timestamptz;
  global_closes_at timestamptz;
  cleaned_questions jsonb;
begin
  if auth.uid() is null or not (public.is_main_admin() or public.can_manage_event(p_event_id)) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'Event title is required' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_summary)), 0) > 600 then
    raise exception 'Summary must be at most 600 characters' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_rules_markdown)), 0) > 20000 then
    raise exception 'Rules content is too long' using errcode = '22023';
  end if;
  if p_group_min_size is not null and p_group_max_size is not null
     and p_group_max_size < p_group_min_size then
    raise exception 'Group max size must be at least min size' using errcode = '22023';
  end if;
  if p_application_questions is not null and jsonb_typeof(p_application_questions) <> 'array' then
    raise exception 'Application questions must be a JSON array' using errcode = '22023';
  end if;
  if p_eligibility is not null and jsonb_typeof(p_eligibility) <> 'object' then
    raise exception 'Eligibility must be a JSON object' using errcode = '22023';
  end if;
  if lower(coalesce(p_eligibility->>'division', 'open')) not in ('boys', 'girls', 'open') then
    raise exception 'Invalid event division' using errcode = '22023';
  end if;

  select edition.registration_opens_at, edition.registration_closes_at
  into global_opens_at, global_closes_at
  from public.events event
  join public.editions edition on edition.id = event.edition_id
  where event.id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(question), '[]'::jsonb)
  into cleaned_questions
  from jsonb_array_elements(coalesce(p_application_questions, '[]'::jsonb)) question
  where lower(coalesce(question->>'key', '') || ' ' || coalesce(question->>'label', ''))
    !~ '(roll|batch|full[ _-]?name|phone|mobile|gender|sex)';

  update public.events set
    title                 = btrim(p_title),
    summary               = btrim(p_summary),
    rules_markdown        = btrim(p_rules_markdown),
    venue                 = nullif(btrim(p_venue), ''),
    application_capacity  = p_application_capacity,
    waitlist_enabled      = coalesce(p_waitlist_enabled, false),
    application_opens_at  = global_opens_at,
    application_closes_at = global_closes_at,
    roster_lock_at        = null,
    reporting_at          = null,
    starts_at             = p_starts_at,
    ends_at               = null,
    eligibility           = coalesce(p_eligibility, '{}'::jsonb),
    application_questions = cleaned_questions,
    group_min_size        = p_group_min_size,
    group_max_size        = p_group_max_size,
    batch_restricted      = coalesce(p_batch_restricted, false),
    poster_url            = nullif(btrim(p_poster_url), '')
  where id = p_event_id
  returning * into updated;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (
    auth.uid(), 'event.full_updated', 'event', updated.id,
    jsonb_build_object('title', updated.title, 'state', updated.state, 'poster_url', updated.poster_url)
  );
  return updated;
end;
$$;

revoke all on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) from public, anon;
grant execute on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) to authenticated;

-- set_admin_event_state: Main Admin can approve draft events to 'open' / 'published' or move between states
create or replace function public.set_admin_event_state(p_event_id uuid, p_state public.event_state)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  event_record public.events;
  edition public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  select * into event_record from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if p_state not in ('draft','published','open','closed','cancelled') then raise exception 'Invalid event lifecycle action' using errcode='22023'; end if;

  -- If opening/publishing and event has no registration window set yet, inherit from edition
  if p_state in ('published','open') and (event_record.application_opens_at is null or event_record.application_closes_at is null) then
    select * into edition from public.editions where id = event_record.edition_id;
    if edition.registration_opens_at is not null and edition.registration_closes_at is not null then
      update public.events
      set application_opens_at = edition.registration_opens_at,
          application_closes_at = edition.registration_closes_at
      where id = p_event_id
      returning * into event_record;
    end if;
  end if;

  update public.events set state=p_state where id=p_event_id returning * into event_record;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
  values(auth.uid(),'event.state_changed','event',event_record.id,jsonb_build_object('state',p_state));
  return event_record;
end;
$$;

revoke all on function public.set_admin_event_state(uuid,public.event_state) from public,anon;
grant execute on function public.set_admin_event_state(uuid,public.event_state) to authenticated;

notify pgrst, 'reload schema';
