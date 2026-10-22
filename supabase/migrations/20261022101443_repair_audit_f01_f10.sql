-- Repair audit findings F01 and F03-F10 in the deployed database.
-- F02 is handled in application source and by operational key rotation.

-- A staff assignment is usable only while the caller has active access to the
-- relevant festival edition. This closes existing sessions immediately after
-- suspension without trusting the SECURITY DEFINER function owner.
create or replace function public.has_active_festival_access(p_edition_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.access_records ar
      where ar.profile_id = auth.uid()
        and ar.state = 'active'
        and (p_edition_id is null or ar.edition_id = p_edition_id)
    );
$$;

revoke all on function public.has_active_festival_access(uuid) from public, anon, authenticated;

create or replace function public.is_main_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      public.has_active_festival_access()
      and exists (
        select 1
        from public.staff_assignments sa
        where sa.profile_id = auth.uid()
          and sa.role = 'main_admin'
          and sa.revoked_at is null
      )
    );
$$;

create or replace function public.can_manage_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      public.has_active_festival_access()
      and exists (
        select 1
        from public.staff_assignments sa
        where sa.profile_id = auth.uid()
          and sa.role in ('main_admin', 'treasurer')
          and sa.revoked_at is null
      )
    );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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
          or (sa.role = 'event_head' and sa.event_id = e.id)
        )
    );
$$;

create or replace function public.can_publish_notices()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      public.has_active_festival_access()
      and exists (
        select 1
        from public.staff_assignments sa
        where sa.profile_id = auth.uid()
          and sa.role in ('main_admin', 'notice_publisher')
          and sa.revoked_at is null
      )
    );
$$;

create or replace function public.can_create_events()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      public.has_active_festival_access()
      and exists (
        select 1
        from public.staff_assignments sa
        where sa.profile_id = auth.uid()
          and sa.role in ('main_admin', 'event_coordinator', 'event_head')
          and sa.revoked_at is null
      )
    );
$$;

revoke all on function public.is_main_admin() from public, anon;
revoke all on function public.can_manage_access() from public, anon;
revoke all on function public.can_manage_event(uuid) from public, anon;
revoke all on function public.can_publish_notices() from public, anon;
revoke all on function public.can_create_events() from public, anon;
grant execute on function public.is_main_admin() to authenticated, service_role;
grant execute on function public.can_manage_access() to authenticated, service_role;
grant execute on function public.can_manage_event(uuid) to authenticated, service_role;
grant execute on function public.can_publish_notices() to authenticated, service_role;
grant execute on function public.can_create_events() to authenticated, service_role;

-- Staff support and recovery paths previously contained direct assignment
-- checks. Route those checks through the active-access guard as well.
create or replace function public.issue_recovery_token(
  p_profile_id uuid,
  p_token_hash text,
  p_reason text
)
returns timestamptz
language plpgsql
security definer
set search_path = public, private
as $$
declare
  expiry timestamptz := now() + interval '30 minutes';
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised to issue recovery' using errcode = '42501';
  end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' or coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'Invalid recovery request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  update private.recovery_tokens
  set invalidated_at = now()
  where profile_id = p_profile_id and used_at is null and invalidated_at is null;
  insert into private.recovery_tokens (profile_id, token_hash, issued_by, reason, expires_at)
  values (p_profile_id, p_token_hash, auth.uid(), btrim(p_reason), expiry);
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (auth.uid(), 'recovery.issued', 'profile', p_profile_id, btrim(p_reason), jsonb_build_object('expires_at', expiry));
  return expiry;
end;
$$;

create or replace function public.list_help_threads_for_staff()
returns table (
  thread_id uuid,
  subject text,
  state text,
  owner_name text,
  event_title text,
  assigned_to_name text,
  created_at timestamptz,
  updated_at timestamptz,
  message_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not (
    public.is_main_admin()
    or public.can_manage_access()
    or (
      public.has_active_festival_access()
      and exists (
        select 1 from public.staff_assignments sa
        where sa.profile_id = auth.uid() and sa.revoked_at is null
      )
    )
  ) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return query
    select
      ht.id,
      ht.subject,
      ht.state::text,
      p.full_name,
      ev.title,
      ap.full_name,
      ht.created_at,
      ht.updated_at,
      count(hm.id)
    from public.help_threads ht
    join public.profiles p on p.id = ht.owner_id
    left join public.events ev on ev.id = ht.event_id
    left join public.profiles ap on ap.id = ht.assigned_to
    left join public.help_messages hm on hm.thread_id = ht.id
    group by ht.id, p.full_name, ev.title, ap.full_name
    order by
      case ht.state when 'open' then 0 when 'in_progress' then 1 else 2 end,
      ht.updated_at desc;
end;
$$;

create or replace function public.add_help_message(p_thread_id uuid, p_message text)
returns public.help_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  thread public.help_threads;
  message public.help_messages;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into thread from public.help_threads where id = p_thread_id for update;
  if not found then
    raise exception 'Help thread not found' using errcode = 'P0002';
  end if;
  if thread.owner_id <> auth.uid() and (
    not public.has_active_festival_access(thread.edition_id)
    or (
      thread.assigned_to is distinct from auth.uid()
      and not public.is_main_admin()
    )
  ) then
    raise exception 'Not authorised for this help thread' using errcode = '42501';
  end if;
  insert into public.help_messages (thread_id, author_id, body)
  values (p_thread_id, auth.uid(), p_message)
  returning * into message;
  update public.help_threads
  set updated_at = now(),
      state = case when state = 'open' then 'in_progress'::public.help_thread_state else state end
  where id = p_thread_id;
  return message;
end;
$$;

-- F05: qualify every lateral snapshot column so output variables cannot shadow
-- table columns in this RETURNS TABLE function.
create or replace function public.list_event_fixtures(p_event_id uuid)
returns table (
  fixture_id uuid,
  stage text,
  participant_a_label text,
  participant_b_label text,
  venue text,
  reporting_at timestamptz,
  starts_at timestamptz,
  state text,
  schedule_version integer,
  score_version integer,
  score_status text,
  score_payload jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_manage_event(p_event_id) then
    raise exception 'Not authorised for this event' using errcode = '42501';
  end if;
  return query
    select
      f.id,
      f.stage,
      f.participant_a_label,
      f.participant_b_label,
      f.venue,
      f.reporting_at,
      f.starts_at,
      f.state::text,
      f.schedule_version,
      coalesce(ss.version, 0)::integer,
      ss.status,
      ss.score_payload
    from public.fixtures f
    left join lateral (
      select
        snapshot.version,
        snapshot.status,
        snapshot.score_payload
      from public.score_snapshots snapshot
      where snapshot.fixture_id = f.id
      order by snapshot.version desc
      limit 1
    ) ss on true
    where f.event_id = p_event_id
    order by f.starts_at nulls last, f.created_at;
end;
$$;

-- F06: this function writes an audit row, so it must be VOLATILE.
create or replace function public.export_event_participants(p_event_id uuid)
returns table (
  fest_id text,
  full_name text,
  batch_label text,
  course_label text,
  roll_canonical text,
  review_state text,
  selection_state text,
  group_name text,
  captain boolean,
  submitted_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_manage_event(p_event_id) then
    raise exception 'Not authorised for this event' using errcode = '42501';
  end if;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'export.participants', 'event', p_event_id, '{}'::jsonb);
  return query
    select
      p.fest_id,
      p.full_name,
      b.label,
      b.course_label,
      p.roll_canonical,
      app.review_state::text,
      app.selection_state::text,
      pg.name,
      (pg.captain_id = p.id),
      app.created_at
    from public.applications app
    join public.profiles p on p.id = app.student_id
    left join public.batches b on b.id = p.batch_id
    left join public.group_memberships gm on gm.application_id = app.id and gm.removed_at is null
    left join public.participant_groups pg on pg.id = gm.group_id and pg.state = 'published'
    where app.event_id = p_event_id
    order by app.review_state, p.full_name;
end;
$$;

-- F07: timed fixtures start scheduled, score status drives fixture state, and a
-- live/paused/final score starts an eligible parent event so public RLS can see it.
create or replace function public.create_fixture(
  p_event_id uuid,
  p_stage text,
  p_participant_a_label text,
  p_participant_b_label text,
  p_venue text default null,
  p_reporting_at timestamptz default null,
  p_starts_at timestamptz default null
)
returns public.fixtures
language plpgsql
security definer
set search_path = public
as $$
declare
  fixture public.fixtures;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then
    raise exception 'Not authorised for this event' using errcode = '42501';
  end if;
  if coalesce(nullif(btrim(p_stage), ''), '') = ''
    or coalesce(nullif(btrim(p_participant_a_label), ''), '') = ''
    or coalesce(nullif(btrim(p_participant_b_label), ''), '') = '' then
    raise exception 'Fixture labels are required' using errcode = '22023';
  end if;
  if btrim(p_participant_a_label) = btrim(p_participant_b_label) then
    raise exception 'Fixture participants must differ' using errcode = '22023';
  end if;
  insert into public.fixtures (
    event_id, stage, participant_a_label, participant_b_label, venue,
    reporting_at, starts_at, state, created_by
  ) values (
    p_event_id, btrim(p_stage), btrim(p_participant_a_label),
    btrim(p_participant_b_label), nullif(btrim(p_venue), ''),
    p_reporting_at, p_starts_at,
    case when p_starts_at is null then 'draft'::public.fixture_state else 'scheduled'::public.fixture_state end,
    auth.uid()
  ) returning * into fixture;
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'fixture.created', 'fixture', fixture.id, jsonb_build_object('event_id', p_event_id));
  return fixture;
end;
$$;

create or replace function public.write_score_snapshot(
  p_fixture_id uuid,
  p_expected_version integer,
  p_score_payload jsonb,
  p_status text
)
returns public.score_snapshots
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_fixture public.fixtures;
  parent_event public.events;
  latest_version integer;
  snapshot public.score_snapshots;
  next_fixture_state public.fixture_state;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into locked_fixture from public.fixtures where id = p_fixture_id for update;
  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_event(locked_fixture.event_id) then
    raise exception 'Not authorised for this event' using errcode = '42501';
  end if;
  if jsonb_typeof(p_score_payload) <> 'object'
    or p_status not in ('scheduled', 'live', 'paused', 'final', 'cancelled') then
    raise exception 'Invalid score snapshot' using errcode = '22023';
  end if;

  select * into parent_event from public.events where id = locked_fixture.event_id for update;
  if p_status in ('live', 'paused', 'final') and parent_event.state in ('draft', 'cancelled') then
    raise exception 'Event must be published before scoring can begin' using errcode = '22023';
  end if;
  if parent_event.state = 'completed' and p_status in ('live', 'paused') then
    raise exception 'A completed event cannot return to live scoring' using errcode = '22023';
  end if;

  select coalesce(max(ss.version), 0)
  into latest_version
  from public.score_snapshots ss
  where ss.fixture_id = p_fixture_id;
  if latest_version <> p_expected_version then
    raise exception 'Score was updated elsewhere' using errcode = '40001';
  end if;

  insert into public.score_snapshots (fixture_id, version, score_payload, status, updated_by)
  values (p_fixture_id, latest_version + 1, p_score_payload, p_status, auth.uid())
  returning * into snapshot;

  next_fixture_state := case p_status
    when 'scheduled' then 'scheduled'::public.fixture_state
    when 'live' then 'ongoing'::public.fixture_state
    when 'paused' then 'ongoing'::public.fixture_state
    when 'final' then 'completed'::public.fixture_state
    when 'cancelled' then 'cancelled'::public.fixture_state
  end;
  update public.fixtures set state = next_fixture_state where id = p_fixture_id;

  if p_status in ('live', 'paused', 'final')
     and parent_event.state in ('published', 'open', 'closed') then
    update public.events set state = 'ongoing' where id = parent_event.id;
    insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
    values (
      auth.uid(),
      'event.started_by_score',
      'event',
      parent_event.id,
      jsonb_build_object('fixture_id', p_fixture_id, 'score_status', p_status)
    );
  end if;

  return snapshot;
end;
$$;

create or replace function public.set_admin_event_state(p_event_id uuid, p_state public.event_state)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  event_record public.events;
  edition public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select * into event_record from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if p_state not in ('draft', 'published', 'open', 'closed', 'ongoing', 'completed', 'cancelled') then
    raise exception 'Invalid event lifecycle action' using errcode = '22023';
  end if;
  if p_state in ('published', 'open')
     and (event_record.application_opens_at is null or event_record.application_closes_at is null) then
    select * into edition from public.editions where id = event_record.edition_id;
    if edition.registration_opens_at is not null and edition.registration_closes_at is not null then
      update public.events
      set application_opens_at = edition.registration_opens_at,
          application_closes_at = edition.registration_closes_at
      where id = p_event_id
      returning * into event_record;
    end if;
  end if;
  update public.events set state = p_state where id = p_event_id returning * into event_record;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.state_changed', 'event', event_record.id, jsonb_build_object('state', p_state));
  return event_record;
end;
$$;

-- F08: the current row no longer carries review metadata after withdrawal;
-- previous review details remain immutable in application_history.
create or replace function public.withdraw_application(p_application_id uuid)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.applications;
  prior_review_state public.application_review_state;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select app.* into application
  from public.applications app
  where app.id = p_application_id and app.student_id = auth.uid()
  for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if application.review_state = 'withdrawn' then
    return application;
  end if;
  if application.selection_state in ('selected', 'reserve') then
    raise exception 'You have been selected. Contact the organiser to withdraw.' using errcode = '22023';
  end if;
  prior_review_state := application.review_state;
  update public.applications
  set review_state = 'withdrawn',
      review_reason = null,
      reviewed_by = null,
      reviewed_at = null,
      withdrawn_at = now()
  where id = application.id
  returning * into application;
  insert into public.application_history(
    application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason
  ) values (
    application.id, auth.uid(), prior_review_state, 'withdrawn',
    application.selection_state, application.selection_state, 'Student withdrew'
  );
  return application;
end;
$$;

-- F09: a new idempotency key explicitly reopens a withdrawn application while
-- retaining the same row required by the event/student uniqueness constraint.
create or replace function public.apply_to_event(
  p_event_id uuid,
  p_idempotency_key uuid,
  p_answers jsonb default '{}'::jsonb
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_event public.events;
  existing_application public.applications;
  application_count integer := 0;
  current_access public.access_records;
  applicant_gender text;
  required_gender text;
  next_review_state public.application_review_state;
  created_application public.applications;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if locked_event.state <> 'open'
    or locked_event.application_opens_at is null
    or locked_event.application_closes_at is null
    or now() < locked_event.application_opens_at
    or now() >= locked_event.application_closes_at then
    raise exception 'Applications are not open' using errcode = '22023';
  end if;
  select * into current_access
  from public.access_records
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
    select 1
    from jsonb_array_elements(coalesce(locked_event.application_questions, '[]'::jsonb)) question
    where coalesce((question->>'required')::boolean, false)
      and nullif(btrim(coalesce(p_answers->>(question->>'key'), '')), '') is null
  ) then
    raise exception 'Complete every required event question' using errcode = '22023';
  end if;

  select * into existing_application
  from public.applications
  where student_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then
    if existing_application.event_id <> p_event_id then
      raise exception 'Idempotency key was already used for another event' using errcode = '22023';
    end if;
    return existing_application;
  end if;

  select * into existing_application
  from public.applications
  where event_id = p_event_id and student_id = auth.uid()
  for update;
  if found and existing_application.review_state <> 'withdrawn' then
    return existing_application;
  end if;

  if locked_event.application_capacity is not null then
    select count(*) into application_count
    from public.applications
    where event_id = p_event_id and review_state <> 'withdrawn';
    if application_count >= locked_event.application_capacity and not locked_event.waitlist_enabled then
      raise exception 'Event application capacity is full' using errcode = '23505';
    end if;
  end if;
  next_review_state := case
    when locked_event.application_capacity is not null
      and application_count >= locked_event.application_capacity
      then 'waitlisted'::public.application_review_state
    else 'submitted'::public.application_review_state
  end;

  if existing_application.id is not null then
    update public.applications
    set idempotency_key = p_idempotency_key,
        review_state = next_review_state,
        selection_state = 'unselected',
        answers = coalesce(p_answers, '{}'::jsonb),
        review_reason = null,
        reviewed_by = null,
        reviewed_at = case when next_review_state = 'waitlisted' then now() else null end,
        withdrawn_at = null
    where id = existing_application.id
    returning * into created_application;
    insert into public.application_history(
      application_id, actor_id, from_review_state, to_review_state,
      from_selection_state, to_selection_state, reason
    ) values (
      created_application.id, auth.uid(), 'withdrawn', created_application.review_state,
      existing_application.selection_state, created_application.selection_state, 'Student reapplied'
    );
    return created_application;
  end if;

  insert into public.applications (
    event_id, student_id, idempotency_key, review_state, reviewed_at, answers
  ) values (
    p_event_id, auth.uid(), p_idempotency_key, next_review_state,
    case when next_review_state = 'waitlisted' then now() else null end,
    coalesce(p_answers, '{}'::jsonb)
  ) returning * into created_application;
  insert into public.application_history(application_id, actor_id, to_review_state, to_selection_state)
  values (created_application.id, auth.uid(), created_application.review_state, created_application.selection_state);
  return created_application;
end;
$$;

-- F10: roster selection must be cleared through the selection workflow before
-- review can move away from approved.
create or replace function public.review_application(
  p_application_id uuid,
  p_state public.application_review_state,
  p_reason text default null
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.applications;
  prior_state public.application_review_state;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_state not in ('approved', 'rejected', 'waitlisted') then
    raise exception 'Invalid review state' using errcode = '22023';
  end if;
  select app.* into application from public.applications app where app.id = p_application_id for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_event(application.event_id) then
    raise exception 'Not authorised for this event' using errcode = '42501';
  end if;
  if p_state = 'rejected' and coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'Rejection reason is required' using errcode = '22023';
  end if;
  if application.review_state = 'withdrawn' then
    raise exception 'Withdrawn applications cannot be reviewed' using errcode = '22023';
  end if;
  if p_state <> 'approved' and application.selection_state in ('selected', 'reserve') then
    raise exception 'Clear the roster selection before changing review state' using errcode = '22023';
  end if;
  prior_state := application.review_state;
  update public.applications
  set review_state = p_state,
      review_reason = nullif(btrim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = application.id
  returning * into application;
  insert into public.application_history(
    application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason
  ) values (
    application.id, auth.uid(), prior_state, application.review_state,
    application.selection_state, application.selection_state, nullif(btrim(p_reason), '')
  );
  insert into public.audit_log(actor_id, action, object_type, object_id, reason)
  values (auth.uid(), 'application.review', 'application', application.id, nullif(btrim(p_reason), ''));
  return application;
end;
$$;

create or replace function public.bulk_review_applications(
  p_application_ids uuid[],
  p_state public.application_review_state,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  app_id uuid;
  app_record public.applications;
  prior_state public.application_review_state;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_state not in ('approved', 'rejected', 'waitlisted') then
    raise exception 'Invalid review state' using errcode = '22023';
  end if;
  if p_state = 'rejected' and coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'Rejection reason is required' using errcode = '22023';
  end if;
  if p_application_ids is null or array_length(p_application_ids, 1) = 0 then
    return 0;
  end if;

  foreach app_id in array p_application_ids loop
    select * into app_record from public.applications where id = app_id for update;
    if found and public.can_manage_event(app_record.event_id) and app_record.review_state <> 'withdrawn' then
      if p_state <> 'approved' and app_record.selection_state in ('selected', 'reserve') then
        raise exception 'Clear roster selections before changing review state' using errcode = '22023';
      end if;
      prior_state := app_record.review_state;
      update public.applications
      set review_state = p_state,
          review_reason = nullif(btrim(p_reason), ''),
          reviewed_by = auth.uid(),
          reviewed_at = now()
      where id = app_id;
      insert into public.application_history(
        application_id, actor_id, from_review_state, to_review_state,
        from_selection_state, to_selection_state, reason
      ) values (
        app_id, auth.uid(), prior_state, p_state,
        app_record.selection_state, app_record.selection_state, nullif(btrim(p_reason), '')
      );
      insert into public.audit_log(actor_id, action, object_type, object_id, reason)
      values (auth.uid(), 'application.bulk_review', 'application', app_id, nullif(btrim(p_reason), ''));
      processed_count := processed_count + 1;
    end if;
  end loop;
  return processed_count;
end;
$$;

-- Registration dates and event lifecycle are independent controls.
create or replace function public.set_global_registration_window(
  p_edition_id uuid,
  p_opens_at timestamptz,
  p_closes_at timestamptz
)
returns public.editions
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'Registration closing time must be after opening time' using errcode = '22023';
  end if;
  update public.editions
  set registration_opens_at = p_opens_at,
      registration_closes_at = p_closes_at
  where id = p_edition_id
  returning * into updated;
  if not found then
    raise exception 'Festival edition not found' using errcode = 'P0002';
  end if;
  update public.events
  set application_opens_at = p_opens_at,
      application_closes_at = p_closes_at
  where edition_id = p_edition_id;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (
    auth.uid(), 'registration.window_updated', 'edition', p_edition_id,
    jsonb_build_object('opens_at', p_opens_at, 'closes_at', p_closes_at)
  );
  return updated;
end;
$$;

notify pgrst, 'reload schema';
