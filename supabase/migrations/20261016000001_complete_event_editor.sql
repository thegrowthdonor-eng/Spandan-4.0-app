-- Extended event editor: expose all editable fields including roster_lock_at,
-- waitlist_enabled, eligibility (batch rules), and application_questions.
-- Also adds application withdrawal and fixes the editor data function.

-- Full event editor data: includes all configurable columns.
drop function if exists public.list_admin_event_editor_data();
create or replace function public.list_admin_event_editor_data()
returns table (
  event_id uuid, title text, category public.event_category,
  format public.event_format, score_template text, state public.event_state,
  summary text, rules_markdown text, venue text,
  application_capacity integer, waitlist_enabled boolean,
  application_opens_at timestamptz, application_closes_at timestamptz,
  roster_lock_at timestamptz, reporting_at timestamptz,
  starts_at timestamptz, ends_at timestamptz,
  eligibility jsonb, application_questions jsonb,
  group_min_size integer, group_max_size integer, batch_restricted boolean
)
language sql stable security definer set search_path = public as $$
  select
    id, title, category, format, score_template, state,
    summary, rules_markdown, venue,
    application_capacity, waitlist_enabled,
    application_opens_at, application_closes_at,
    roster_lock_at, reporting_at, starts_at, ends_at,
    eligibility, application_questions,
    group_min_size, group_max_size, batch_restricted
  from public.events
  where public.is_main_admin()
  order by title;
$$;
revoke all on function public.list_admin_event_editor_data() from public, anon;
grant execute on function public.list_admin_event_editor_data() to authenticated;

-- Full update including all timing fields and questions.
-- Fixes the bug where updating only content always nulled timing values.
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
  p_batch_restricted boolean
)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  updated public.events;
  generated_slug text;
begin
  if auth.uid() is null or not public.is_main_admin() then
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
  if p_application_closes_at is not null and p_application_opens_at is not null
     and p_application_closes_at <= p_application_opens_at then
    raise exception 'Registration closing time must be after opening time' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then
    raise exception 'Event end time must be after start time' using errcode = '22023';
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

  update public.events set
    title                 = btrim(p_title),
    summary               = btrim(p_summary),
    rules_markdown        = btrim(p_rules_markdown),
    venue                 = nullif(btrim(p_venue), ''),
    application_capacity  = p_application_capacity,
    waitlist_enabled      = coalesce(p_waitlist_enabled, false),
    application_opens_at  = p_application_opens_at,
    application_closes_at = p_application_closes_at,
    roster_lock_at        = p_roster_lock_at,
    reporting_at          = p_reporting_at,
    starts_at             = p_starts_at,
    ends_at               = p_ends_at,
    eligibility           = coalesce(p_eligibility, '{}'::jsonb),
    application_questions = coalesce(p_application_questions, '[]'::jsonb),
    group_min_size        = p_group_min_size,
    group_max_size        = p_group_max_size,
    batch_restricted      = coalesce(p_batch_restricted, false)
  where id = p_event_id
  returning * into updated;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.full_updated', 'event', updated.id,
    jsonb_build_object('title', updated.title, 'state', updated.state));
  return updated;
end;
$$;
revoke all on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean) from public, anon;
grant execute on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean) to authenticated;

-- Application withdrawal: student withdraws their own application before roster lock.
create or replace function public.withdraw_application(p_application_id uuid)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare
  application public.applications;
  event_record public.events;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  select app.* into application from public.applications app
    where app.id = p_application_id and app.student_id = auth.uid()
    for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if application.review_state = 'withdrawn' then
    return application;
  end if;
  select * into event_record from public.events where id = application.event_id;
  -- Block withdrawal after roster lock
  if event_record.roster_lock_at is not null and now() >= event_record.roster_lock_at then
    raise exception 'Roster is locked. Contact the organiser for changes.' using errcode = '22023';
  end if;
  -- Block withdrawal if already selected into a group
  if application.selection_state = 'selected' then
    raise exception 'You have been selected. Contact the organiser to withdraw.' using errcode = '22023';
  end if;
  update public.applications
    set review_state = 'withdrawn', withdrawn_at = now()
    where id = application.id
    returning * into application;
  insert into public.application_history(application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason)
  values (application.id, auth.uid(), 'submitted', 'withdrawn',
    application.selection_state, application.selection_state, 'Student withdrew');
  return application;
end;
$$;
revoke all on function public.withdraw_application(uuid) from public, anon;
grant execute on function public.withdraw_application(uuid) to authenticated;

-- Event-scoped participant export for Event Heads (CSV-safe text values only).
create or replace function public.export_event_participants(p_event_id uuid)
returns table (
  fest_id text, full_name text, batch_label text, course_label text,
  roll_canonical text, review_state text, selection_state text,
  group_name text, captain boolean, submitted_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
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
revoke all on function public.export_event_participants(uuid) from public, anon;
grant execute on function public.export_event_participants(uuid) to authenticated;

-- Score entry status for admin fixtures view
create or replace function public.list_event_fixtures(p_event_id uuid)
returns table (
  fixture_id uuid, stage text, participant_a_label text, participant_b_label text,
  venue text, reporting_at timestamptz, starts_at timestamptz,
  state text, schedule_version integer, score_version integer, score_status text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select
      f.id, f.stage, f.participant_a_label, f.participant_b_label,
      f.venue, f.reporting_at, f.starts_at,
      f.state::text, f.schedule_version,
      coalesce(ss.version, 0),
      ss.status
    from public.fixtures f
    left join lateral (
      select version, status from public.score_snapshots
      where fixture_id = f.id order by version desc limit 1
    ) ss on true
    where f.event_id = p_event_id
    order by f.starts_at nulls last, f.created_at;
end;
$$;
revoke all on function public.list_event_fixtures(uuid) from public, anon;
grant execute on function public.list_event_fixtures(uuid) to authenticated;

-- Fixture reschedule with mandatory reason and history preservation
create or replace function public.reschedule_fixture(
  p_fixture_id uuid,
  p_reporting_at timestamptz,
  p_starts_at timestamptz,
  p_venue text,
  p_reason text
)
returns public.fixtures
language plpgsql security definer set search_path = public as $$
declare
  fixture public.fixtures;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'A reschedule reason is required' using errcode = '22023';
  end if;
  -- Save history of previous schedule
  insert into public.fixture_history(fixture_id, actor_id, previous_schedule, reason)
  values (fixture.id, auth.uid(),
    jsonb_build_object(
      'reporting_at', fixture.reporting_at,
      'starts_at', fixture.starts_at,
      'venue', fixture.venue,
      'schedule_version', fixture.schedule_version
    ),
    btrim(p_reason));
  update public.fixtures set
    reporting_at     = p_reporting_at,
    starts_at        = p_starts_at,
    venue            = nullif(btrim(p_venue), ''),
    schedule_version = fixture.schedule_version + 1,
    state            = case when fixture.state = 'draft' then 'scheduled'::public.fixture_state else fixture.state end
  where id = fixture.id
  returning * into fixture;
  return fixture;
end;
$$;
revoke all on function public.reschedule_fixture(uuid,timestamptz,timestamptz,text,text) from public, anon;
grant execute on function public.reschedule_fixture(uuid,timestamptz,timestamptz,text,text) to authenticated;

-- List fixture history for a given fixture (event head/admin)
create or replace function public.list_fixture_history(p_fixture_id uuid)
returns table (
  history_id uuid, actor_name text, previous_schedule jsonb, reason text, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  fixture_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select event_id into fixture_event_id from public.fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select fh.id, p.full_name, fh.previous_schedule, fh.reason, fh.created_at
    from public.fixture_history fh
    left join public.profiles p on p.id = fh.actor_id
    where fh.fixture_id = p_fixture_id
    order by fh.created_at desc;
end;
$$;
revoke all on function public.list_fixture_history(uuid) from public, anon;
grant execute on function public.list_fixture_history(uuid) to authenticated;
