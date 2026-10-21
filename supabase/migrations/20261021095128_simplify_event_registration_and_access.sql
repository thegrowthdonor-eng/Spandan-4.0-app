-- Simplify the operational model around one festival registration window,
-- make gender eligibility enforceable, and restrict app controllers to the 2023 batch.

alter table public.profiles
  add column if not exists gender text
  check (gender in ('male', 'female', 'other', 'prefer_not_to_say'));

alter table public.editions
  add column if not exists registration_opens_at timestamptz,
  add column if not exists registration_closes_at timestamptz;

alter table public.editions
  drop constraint if exists editions_registration_window_check;
alter table public.editions
  add constraint editions_registration_window_check check (
    registration_opens_at is null
    or registration_closes_at is null
    or registration_closes_at > registration_opens_at
  );

-- Testing mode requested by the organiser: one currently-open window for every
-- non-archived edition. The editor can replace this with the final dates later.
update public.editions
set registration_opens_at = coalesce(registration_opens_at, now() - interval '1 hour'),
    registration_closes_at = case
      when registration_closes_at is null or registration_closes_at <= now()
        then now() + interval '30 days'
      else registration_closes_at
    end
where status <> 'archived';

update public.events event
set application_opens_at = edition.registration_opens_at,
    application_closes_at = edition.registration_closes_at,
    roster_lock_at = null,
    reporting_at = null,
    ends_at = null,
    state = case
      when event.state in ('cancelled', 'completed') then event.state
      else 'open'::public.event_state
    end
from public.editions edition
where edition.id = event.edition_id;

-- Profile data is already known. Keep only event-specific questions.
update public.events event
set application_questions = coalesce((
  select jsonb_agg(question)
  from jsonb_array_elements(event.application_questions) question
  where lower(coalesce(question->>'key', '') || ' ' || coalesce(question->>'label', ''))
    !~ '(roll|batch|full[ _-]?name|phone|mobile|gender|sex)'
), '[]'::jsonb);

drop function if exists public.provision_student_profile(uuid, uuid, uuid, text, text, text, text, text);
create function public.provision_student_profile(
  p_auth_user_id uuid,
  p_edition_id uuid,
  p_batch_id uuid,
  p_full_name text,
  p_roll_canonical text,
  p_phone_e164 text,
  p_fest_id text,
  p_auth_email text,
  p_gender text
)
returns public.profiles
language plpgsql security definer set search_path = public, private as $$
declare profile public.profiles;
begin
  if p_gender not in ('male', 'female', 'other', 'prefer_not_to_say') then
    raise exception 'Choose a valid gender option' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.batches
    where id = p_batch_id and edition_id = p_edition_id and eligible
  ) then
    raise exception 'Invalid eligible batch' using errcode = '22023';
  end if;
  insert into public.profiles (
    id, full_name, batch_id, roll_canonical, phone_e164, fest_id, gender
  ) values (
    p_auth_user_id, p_full_name, p_batch_id, p_roll_canonical,
    p_phone_e164, p_fest_id, p_gender
  ) returning * into profile;
  insert into private.auth_identity_map (profile_id, auth_email)
  values (p_auth_user_id, p_auth_email);
  insert into public.access_records (edition_id, profile_id, state)
  values (p_edition_id, p_auth_user_id, 'pending');
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (
    p_auth_user_id, 'profile.created', 'profile', p_auth_user_id,
    jsonb_build_object('source', 'signup', 'gender_captured', true)
  );
  return profile;
end;
$$;
revoke all on function public.provision_student_profile(uuid, uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.provision_student_profile(uuid, uuid, uuid, text, text, text, text, text, text) to service_role;

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
  where public.is_main_admin()
  order by e.starts_on nulls last, e.created_at desc;
$$;
revoke all on function public.list_admin_editions() from public, anon;
grant execute on function public.list_admin_editions() to authenticated;

create or replace function public.set_global_registration_window(
  p_edition_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
returns public.editions
language plpgsql security definer set search_path = public as $$
declare updated public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'Registration closing time must be after opening time' using errcode = '22023';
  end if;
  update public.editions
  set registration_opens_at = p_opens_at, registration_closes_at = p_closes_at
  where id = p_edition_id
  returning * into updated;
  if not found then raise exception 'Festival edition not found' using errcode = 'P0002'; end if;
  update public.events
  set application_opens_at = p_opens_at,
      application_closes_at = p_closes_at,
      state = case when state in ('cancelled', 'completed') then state else 'open'::public.event_state end
  where edition_id = p_edition_id;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'registration.window_updated', 'edition', p_edition_id,
    jsonb_build_object('opens_at', p_opens_at, 'closes_at', p_closes_at));
  return updated;
end;
$$;
revoke all on function public.set_global_registration_window(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.set_global_registration_window(uuid, timestamptz, timestamptz) to authenticated;

drop function if exists public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz);
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
declare created public.events; generated_slug text; edition public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into edition from public.editions where id = p_edition_id;
  if not found then raise exception 'Festival edition not found' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if p_score_template not in ('generic', 'cricket', 'football', 'badminton') then raise exception 'Invalid score template' using errcode = '22023'; end if;
  if p_division not in ('boys', 'girls', 'open') then raise exception 'Invalid event division' using errcode = '22023'; end if;
  generated_slug := trim(both '-' from regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then raise exception 'Event title needs letters or numbers' using errcode = '22023'; end if;
  insert into public.events (
    edition_id, title, slug, category, format, score_template, summary, venue,
    application_capacity, application_opens_at, application_closes_at,
    starts_at, state, eligibility
  ) values (
    p_edition_id, btrim(p_title), generated_slug, p_category, p_format,
    p_score_template, btrim(p_summary), nullif(btrim(p_venue), ''),
    p_application_capacity, edition.registration_opens_at, edition.registration_closes_at,
    p_starts_at, 'open', jsonb_build_object('division', p_division)
  ) returning * into created;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.created', 'event', created.id,
    jsonb_build_object('edition_id', p_edition_id, 'slug', created.slug, 'state', created.state));
  return created;
end;
$$;
revoke all on function public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz, text) to authenticated;

create or replace function public.list_committee_candidates()
returns table (profile_id uuid, full_name text, fest_id text, batch_label text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.fest_id, b.label
  from public.profiles p
  join public.batches b on b.id = p.batch_id
  join public.access_records ar on ar.profile_id = p.id
  where ar.state = 'active' and b.label = '2023' and public.is_main_admin()
  order by p.full_name;
$$;
revoke all on function public.list_committee_candidates() from public, anon;
grant execute on function public.list_committee_candidates() to authenticated;

create or replace function public.assign_committee_role(
  p_profile_id uuid,
  p_role public.staff_role,
  p_event_id uuid default null
)
returns public.staff_assignments language plpgsql security definer set search_path = public as $$
declare assignment public.staff_assignments;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  if not exists (
    select 1 from public.profiles p
    join public.batches b on b.id = p.batch_id
    join public.access_records ar on ar.profile_id = p.id
    where p.id = p_profile_id and ar.state = 'active' and b.label = '2023'
  ) then raise exception 'App controllers must be active students from the 2023 batch' using errcode='22023'; end if;
  if (p_role = 'event_head') <> (p_event_id is not null) then raise exception 'Event heads require exactly one assigned event' using errcode='22023'; end if;
  if p_event_id is not null and not exists (select 1 from public.events where id=p_event_id) then raise exception 'Event not found' using errcode='22023'; end if;
  insert into public.staff_assignments(profile_id, role, event_id, granted_by)
  values(p_profile_id, p_role, p_event_id, auth.uid()) returning * into assignment;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values(auth.uid(), 'committee.role_granted', 'staff_assignment', assignment.id,
    jsonb_build_object('role', p_role, 'profile_id', p_profile_id, 'event_id', p_event_id));
  return assignment;
end;
$$;
revoke all on function public.assign_committee_role(uuid, public.staff_role, uuid) from public, anon;
grant execute on function public.assign_committee_role(uuid, public.staff_role, uuid) to authenticated;

create or replace function public.apply_to_event(
  p_event_id uuid,
  p_idempotency_key uuid,
  p_answers jsonb default '{}'::jsonb
)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare
  locked_event public.events;
  existing_application public.applications;
  application_count integer := 0;
  current_access public.access_records;
  applicant_gender text;
  required_gender text;
  created_application public.applications;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if locked_event.state <> 'open'
    or locked_event.application_opens_at is null
    or locked_event.application_closes_at is null
    or now() < locked_event.application_opens_at
    or now() >= locked_event.application_closes_at then
    raise exception 'Applications are not open' using errcode = '22023';
  end if;
  select * into current_access from public.access_records
    where edition_id = locked_event.edition_id and profile_id = auth.uid();
  if not found or current_access.state <> 'active' then
    raise exception 'Account is not active for registration' using errcode = '42501';
  end if;
  select gender into applicant_gender from public.profiles where id = auth.uid();
  required_gender := case lower(coalesce(locked_event.eligibility->>'division', 'open'))
    when 'boys' then 'male'
    when 'girls' then 'female'
    else null
  end;
  if required_gender is not null and applicant_gender is not null and applicant_gender <> required_gender then
    raise exception 'This event is not available for your registered gender division' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(locked_event.application_questions, '[]'::jsonb)) question
    where coalesce((question->>'required')::boolean, false)
      and nullif(btrim(coalesce(p_answers->>(question->>'key'), '')), '') is null
  ) then raise exception 'Complete every required event question' using errcode = '22023'; end if;
  select * into existing_application from public.applications
    where student_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return existing_application; end if;
  select * into existing_application from public.applications
    where event_id = p_event_id and student_id = auth.uid();
  if found then return existing_application; end if;
  if locked_event.application_capacity is not null then
    select count(*) into application_count from public.applications
      where event_id = p_event_id and review_state <> 'withdrawn';
    if application_count >= locked_event.application_capacity and not locked_event.waitlist_enabled then
      raise exception 'Event application capacity is full' using errcode = '23505';
    end if;
  end if;
  insert into public.applications (event_id, student_id, idempotency_key, review_state, reviewed_at, answers)
  values (
    p_event_id, auth.uid(), p_idempotency_key,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity
      then 'waitlisted'::public.application_review_state else 'submitted'::public.application_review_state end,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity
      then now() else null end,
    coalesce(p_answers, '{}'::jsonb)
  ) returning * into created_application;
  insert into public.application_history (application_id, actor_id, to_review_state, to_selection_state)
  values (created_application.id, auth.uid(), created_application.review_state, created_application.selection_state);
  return created_application;
end;
$$;
revoke all on function public.apply_to_event(uuid, uuid, jsonb) from public, anon;
grant execute on function public.apply_to_event(uuid, uuid, jsonb) to authenticated;

create or replace function public.withdraw_application(p_application_id uuid)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare application public.applications;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select app.* into application from public.applications app
  where app.id = p_application_id and app.student_id = auth.uid() for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  if application.review_state = 'withdrawn' then return application; end if;
  if application.selection_state = 'selected' then
    raise exception 'You have been selected. Contact the organiser to withdraw.' using errcode = '22023';
  end if;
  update public.applications set review_state = 'withdrawn', withdrawn_at = now()
  where id = application.id returning * into application;
  insert into public.application_history(
    application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason
  ) values (
    application.id, auth.uid(), 'submitted', 'withdrawn',
    application.selection_state, application.selection_state, 'Student withdrew'
  );
  return application;
end;
$$;
revoke all on function public.withdraw_application(uuid) from public, anon;
grant execute on function public.withdraw_application(uuid) to authenticated;

notify pgrst, 'reload schema';
