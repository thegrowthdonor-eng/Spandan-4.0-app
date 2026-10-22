-- Repairs for AUDIT findings F11 and F13-F20. F12 is intentionally not changed.

-- F11: Bulk selection must obey exactly the same solo and published-group rules
-- as the single-application workflow. Validate the entire batch before making
-- any change so callers never receive a partially applied selection.
create or replace function public.bulk_solo_selection(
  p_application_ids uuid[],
  p_selection_state public.selection_state,
  p_reason text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  app_record public.applications;
  event_record public.events;
  prior_selection public.selection_state;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_selection_state not in ('selected', 'reserve', 'not_selected') then
    raise exception 'Invalid selection state' using errcode = '22023';
  end if;
  if p_application_ids is null or cardinality(p_application_ids) = 0 then
    raise exception 'At least one application is required' using errcode = '22023';
  end if;
  if cardinality(p_application_ids) <> (select count(distinct application_id) from unnest(p_application_ids) as ids(application_id)) then
    raise exception 'Each application may be selected only once per request' using errcode = '22023';
  end if;

  -- Lock in a stable order, then validate every requested row before updating.
  for app_record in
    select application.*
    from public.applications application
    where application.id = any(p_application_ids)
    order by application.id
    for update
  loop
    if not public.can_manage_event(app_record.event_id) then
      raise exception 'Not authorised for this event' using errcode = '42501';
    end if;
    select * into event_record from public.events where id = app_record.event_id;
    if event_record.format <> 'solo' then
      raise exception 'Bulk solo selection is available only for solo events' using errcode = '22023';
    end if;
    if app_record.review_state <> 'approved' then
      raise exception 'Only approved applications can be selected' using errcode = '22023';
    end if;
    if exists (
      select 1
      from public.group_memberships membership
      join public.participant_groups participant_group on participant_group.id = membership.group_id
      where membership.application_id = app_record.id
        and membership.removed_at is null
        and participant_group.state = 'published'
    ) then
      raise exception 'Published squad members must be managed through their squad' using errcode = '22023';
    end if;
  end loop;

  if (select count(*) from public.applications where id = any(p_application_ids)) <> cardinality(p_application_ids) then
    raise exception 'One or more applications were not found' using errcode = 'P0002';
  end if;

  for app_record in
    select application.*
    from public.applications application
    where application.id = any(p_application_ids)
    order by application.id
  loop
    prior_selection := app_record.selection_state;
    update public.applications
    set selection_state = p_selection_state
    where id = app_record.id;

    insert into public.application_history (
      application_id, actor_id, from_review_state, to_review_state,
      from_selection_state, to_selection_state, reason
    ) values (
      app_record.id, auth.uid(), app_record.review_state, app_record.review_state,
      prior_selection, p_selection_state, nullif(btrim(p_reason), '')
    );

    insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
    values (
      auth.uid(), 'application.bulk_select_solo', 'application', app_record.id,
      nullif(btrim(p_reason), ''), jsonb_build_object('selection_state', p_selection_state)
    );
    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;
revoke all on function public.bulk_solo_selection(uuid[], public.selection_state, text) from public, anon;
grant execute on function public.bulk_solo_selection(uuid[], public.selection_state, text) to authenticated;

-- F13: private senior-auth records deliberately have no public access. Remove
-- their references inside the controlled profile-deletion transaction, while
-- retaining the public audit entry made at the end of this function.
create or replace function public.delete_student_profile(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_profile public.profiles;
  caller_is_admin boolean;
  target_is_admin boolean;
  remaining_admins integer;
begin
  caller_is_admin := public.is_main_admin();
  if auth.uid() is not null and not (caller_is_admin or public.can_manage_access()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into target_profile from public.profiles where id = p_profile_id for update;
  if not found then return false; end if;

  target_is_admin := exists (
    select 1 from public.staff_assignments
    where profile_id = p_profile_id and revoked_at is null and role = 'main_admin'
  );
  if target_is_admin then
    if not caller_is_admin then
      raise exception 'Only Main Admins can remove an Admin profile' using errcode = '42501';
    end if;
    if auth.uid() = p_profile_id then
      raise exception 'You cannot remove your own Admin profile' using errcode = '22023';
    end if;
    select count(*) into remaining_admins
    from public.staff_assignments
    where role = 'main_admin' and revoked_at is null and profile_id <> p_profile_id;
    if remaining_admins = 0 then
      raise exception 'Cannot remove the last remaining Main Admin' using errcode = '22023';
    end if;
  end if;

  delete from public.group_memberships where application_id in (select id from public.applications where student_id = p_profile_id);
  delete from public.application_history where application_id in (select id from public.applications where student_id = p_profile_id) or actor_id = p_profile_id;
  delete from public.applications where student_id = p_profile_id;
  delete from public.group_memberships where group_id in (select id from public.participant_groups where captain_id = p_profile_id or created_by = p_profile_id);
  delete from public.participant_groups where captain_id = p_profile_id or created_by = p_profile_id;
  delete from public.help_messages where author_id = p_profile_id or thread_id in (select id from public.help_threads where owner_id = p_profile_id);
  delete from public.help_threads where owner_id = p_profile_id;
  update public.help_threads set assigned_to = null where assigned_to = p_profile_id;
  update public.audit_log set actor_id = null where actor_id = p_profile_id;
  update public.access_records set verified_by = null where verified_by = p_profile_id;
  update public.staff_assignments set granted_by = null where granted_by = p_profile_id;
  update public.applications set reviewed_by = null where reviewed_by = p_profile_id;
  delete from private.recovery_tokens where profile_id = p_profile_id or issued_by = p_profile_id;
  delete from private.senior_invites where profile_id = p_profile_id or issued_by = p_profile_id;
  delete from private.senior_login where profile_id = p_profile_id;
  delete from private.auth_identity_map where profile_id = p_profile_id;
  delete from public.access_records where profile_id = p_profile_id;
  delete from public.poll_votes where profile_id = p_profile_id;
  delete from public.reminders where profile_id = p_profile_id;
  delete from public.push_subscriptions where profile_id = p_profile_id;
  delete from public.feedback_responses where profile_id = p_profile_id;
  delete from public.staff_assignments where profile_id = p_profile_id;
  delete from public.profiles where id = p_profile_id;

  if auth.uid() is not null then
    insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
    values (
      auth.uid(), 'profile.deleted', 'profile', p_profile_id,
      jsonb_build_object('full_name', target_profile.full_name, 'fest_id', target_profile.fest_id, 'was_admin', target_is_admin)
    );
  end if;
  return true;
end;
$$;
revoke all on function public.delete_student_profile(uuid) from public;
grant execute on function public.delete_student_profile(uuid) to authenticated;

-- F14: gender is required at senior-invite redemption. Existing profiles with
-- unknown gender are deliberately denied only from gender-restricted events.
drop function if exists public.complete_senior_invite(text, uuid, text);
create function public.complete_senior_invite(p_hash text, p_user uuid, p_email text, p_gender text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  invite private.senior_invites;
begin
  if p_gender not in ('male', 'female', 'other', 'prefer_not_to_say') then
    raise exception 'A valid gender is required' using errcode = '22023';
  end if;
  select * into invite from private.senior_invites where token_hash = p_hash for update;
  if not found or invite.used_at is null or invite.revoked_at is not null or invite.expires_at <= now() or invite.profile_id is not null then
    raise exception 'Invite unavailable' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user and email = p_email) then
    raise exception 'Identity mismatch' using errcode = '22023';
  end if;
  insert into public.profiles(id, full_name, phone_e164, fest_id, participant_category, department, gender)
  values (p_user, invite.full_name, invite.phone, 'SPD-' || upper(substr(replace(p_user::text, '-', ''), 1, 12)), invite.category, invite.department, p_gender);
  insert into private.senior_login(profile_id, phone, auth_email) values (p_user, invite.phone, p_email);
  insert into public.access_records(edition_id, profile_id, state, verified_by, verified_at, reason)
  values(invite.edition_id, p_user, 'active', invite.issued_by, now(), 'Committee verified personal invitation');
  update private.senior_invites set profile_id = p_user where id = invite.id;
  insert into public.audit_log(actor_id, action, object_type, object_id) values(p_user, 'senior.activated', 'profile', p_user);
end;
$$;
revoke all on function public.complete_senior_invite(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_senior_invite(text, uuid, text, text) to service_role;

-- F14/F19: event eligibility answers are validated again at the authoritative
-- write boundary. A missing gender can never qualify for a boys/girls event,
-- and select answers must be configured options.
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
  created_application public.applications;
  question jsonb;
  answer text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then raise exception 'Application answers must be an object' using errcode = '22023'; end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if locked_event.state <> 'open' or locked_event.application_opens_at is null or locked_event.application_closes_at is null or now() < locked_event.application_opens_at or now() >= locked_event.application_closes_at then
    raise exception 'Applications are not open' using errcode = '22023';
  end if;
  select * into current_access from public.access_records where edition_id = locked_event.edition_id and profile_id = auth.uid();
  if not found or current_access.state <> 'active' then raise exception 'Account is not active for registration' using errcode = '42501'; end if;
  select gender into applicant_gender from public.profiles where id = auth.uid();
  required_gender := case lower(coalesce(locked_event.eligibility->>'division', 'open')) when 'boys' then 'male' when 'girls' then 'female' else null end;
  if required_gender is not null and applicant_gender is distinct from required_gender then
    raise exception 'This event is not available for your registered gender division' using errcode = '42501';
  end if;

  for question in select value from jsonb_array_elements(coalesce(locked_event.application_questions, '[]'::jsonb)) loop
    answer := nullif(btrim(coalesce(p_answers ->> (question ->> 'key'), '')), '');
    if coalesce((question ->> 'required')::boolean, false) and answer is null then
      raise exception 'Complete every required event question' using errcode = '22023';
    end if;
    if question ->> 'type' = 'select' and answer is not null and not exists (
      select 1 from jsonb_array_elements_text(coalesce(question -> 'options', '[]'::jsonb)) option_value
      where option_value = answer
    ) then
      raise exception 'Choose a listed option for every select question' using errcode = '22023';
    end if;
  end loop;

  if exists (
    select 1 from jsonb_object_keys(p_answers) as supplied(answer_key)
    where not exists (
      select 1 from jsonb_array_elements(coalesce(locked_event.application_questions, '[]'::jsonb)) configured_question
      where configured_question ->> 'key' = answer_key
    )
  ) then raise exception 'Application contains an unknown question answer' using errcode = '22023'; end if;

  select * into existing_application from public.applications where student_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return existing_application; end if;
  select * into existing_application from public.applications where event_id = p_event_id and student_id = auth.uid();
  if found then return existing_application; end if;
  if locked_event.application_capacity is not null then
    select count(*) into application_count from public.applications where event_id = p_event_id and review_state <> 'withdrawn';
    if application_count >= locked_event.application_capacity and not locked_event.waitlist_enabled then raise exception 'Event application capacity is full' using errcode = '23505'; end if;
  end if;
  insert into public.applications (event_id, student_id, idempotency_key, review_state, reviewed_at, answers)
  values (p_event_id, auth.uid(), p_idempotency_key,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity then 'waitlisted'::public.application_review_state else 'submitted'::public.application_review_state end,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity then now() else null end,
    coalesce(p_answers, '{}'::jsonb))
  returning * into created_application;
  insert into public.application_history (application_id, actor_id, to_review_state, to_selection_state)
  values (created_application.id, auth.uid(), created_application.review_state, created_application.selection_state);
  return created_application;
end;
$$;
revoke all on function public.apply_to_event(uuid, uuid, jsonb) from public, anon;
grant execute on function public.apply_to_event(uuid, uuid, jsonb) to authenticated;

-- F17: the API validates the same template client-side, but this RPC remains
-- authoritative and rejects malformed/negative/unknown score fields.
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
  key text;
  value text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_expected_version < 0 or jsonb_typeof(p_score_payload) <> 'object' or p_status not in ('scheduled', 'live', 'paused', 'final', 'cancelled') then raise exception 'Invalid score snapshot' using errcode = '22023'; end if;
  select * into locked_fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(locked_fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  select * into parent_event from public.events where id = locked_fixture.event_id for update;

  if parent_event.score_template = 'football' then
    if (p_score_payload - array['teamA_goals', 'teamB_goals', 'penalties']) <> '{}'::jsonb
      or not (p_score_payload ? 'teamA_goals' and p_score_payload ? 'teamB_goals') then raise exception 'Invalid football score payload' using errcode = '22023'; end if;
    foreach key in array array['teamA_goals', 'teamB_goals'] loop
      value := p_score_payload ->> key;
      if value !~ '^\d+$' or value::numeric > 99 then raise exception 'Football goals must be whole numbers from 0 to 99' using errcode = '22023'; end if;
    end loop;
    if p_score_payload ? 'penalties' and char_length(coalesce(p_score_payload ->> 'penalties', '')) > 160 then raise exception 'Football penalty note is too long' using errcode = '22023'; end if;
  elsif parent_event.score_template = 'cricket' then
    if (p_score_payload - array['teamA_runs', 'teamA_wickets', 'teamA_overs', 'teamB_runs', 'teamB_wickets', 'teamB_overs', 'summary']) <> '{}'::jsonb
      or not (p_score_payload ?& array['teamA_runs', 'teamA_wickets', 'teamA_overs', 'teamB_runs', 'teamB_wickets', 'teamB_overs']) then raise exception 'Invalid cricket score payload' using errcode = '22023'; end if;
    foreach key in array array['teamA_runs', 'teamB_runs'] loop
      value := p_score_payload ->> key;
      if value !~ '^\d+$' or value::numeric > 999 then raise exception 'Cricket runs must be whole numbers from 0 to 999' using errcode = '22023'; end if;
    end loop;
    foreach key in array array['teamA_wickets', 'teamB_wickets'] loop
      value := p_score_payload ->> key;
      if value !~ '^\d+$' or value::numeric > 10 then raise exception 'Cricket wickets must be whole numbers from 0 to 10' using errcode = '22023'; end if;
    end loop;
    foreach key in array array['teamA_overs', 'teamB_overs'] loop
      if coalesce(p_score_payload ->> key, '') !~ '^\d+\.[0-5]$' then raise exception 'Cricket overs must use the format overs.balls (balls 0-5)' using errcode = '22023'; end if;
    end loop;
    if p_score_payload ? 'summary' and char_length(coalesce(p_score_payload ->> 'summary', '')) > 1000 then raise exception 'Cricket summary is too long' using errcode = '22023'; end if;
  elsif parent_event.score_template = 'badminton' then
    if (p_score_payload - array['set1', 'set2', 'set3', 'winner']) <> '{}'::jsonb or nullif(btrim(coalesce(p_score_payload ->> 'set1', '')), '') is null then raise exception 'Invalid badminton score payload' using errcode = '22023'; end if;
    foreach key in array array['set1', 'set2', 'set3'] loop
      value := nullif(btrim(coalesce(p_score_payload ->> key, '')), '');
      if value is not null and value !~ '^\d{1,3}-\d{1,3}$' then raise exception 'Badminton sets must use the format points-points' using errcode = '22023'; end if;
    end loop;
    if p_score_payload ? 'winner' and nullif(btrim(coalesce(p_score_payload ->> 'winner', '')), '') is not null
      and p_score_payload ->> 'winner' not in (locked_fixture.participant_a_label, locked_fixture.participant_b_label) then raise exception 'Badminton winner must be a fixture participant' using errcode = '22023'; end if;
  else
    if (p_score_payload - array['winner', 'summary']) <> '{}'::jsonb
      or (p_status in ('live', 'paused', 'final') and nullif(btrim(coalesce(p_score_payload ->> 'winner', '')), '') is null and nullif(btrim(coalesce(p_score_payload ->> 'summary', '')), '') is null) then raise exception 'A generic score requires a result or summary' using errcode = '22023'; end if;
    if char_length(coalesce(p_score_payload ->> 'winner', '')) > 160 or char_length(coalesce(p_score_payload ->> 'summary', '')) > 1000 then raise exception 'Generic score text is too long' using errcode = '22023'; end if;
  end if;

  if p_status in ('live', 'paused', 'final') and parent_event.state in ('draft', 'cancelled') then raise exception 'Event must be published before scoring can begin' using errcode = '22023'; end if;
  if parent_event.state = 'completed' and p_status in ('live', 'paused') then raise exception 'A completed event cannot return to live scoring' using errcode = '22023'; end if;
  select coalesce(max(score_snapshot.version), 0) into latest_version from public.score_snapshots score_snapshot where score_snapshot.fixture_id = p_fixture_id;
  if latest_version <> p_expected_version then raise exception 'Score was updated elsewhere' using errcode = '40001'; end if;
  insert into public.score_snapshots (fixture_id, version, score_payload, status, updated_by)
  values (p_fixture_id, latest_version + 1, p_score_payload, p_status, auth.uid()) returning * into snapshot;
  next_fixture_state := case p_status when 'scheduled' then 'scheduled'::public.fixture_state when 'live' then 'ongoing'::public.fixture_state when 'paused' then 'ongoing'::public.fixture_state when 'final' then 'completed'::public.fixture_state when 'cancelled' then 'cancelled'::public.fixture_state end;
  update public.fixtures set state = next_fixture_state where id = p_fixture_id;
  if p_status in ('live', 'paused', 'final') and parent_event.state in ('published', 'open', 'closed') then update public.events set state = 'ongoing' where id = parent_event.id; end if;
  return snapshot;
end;
$$;
revoke all on function public.write_score_snapshot(uuid, integer, jsonb, text) from public, anon;
grant execute on function public.write_score_snapshot(uuid, integer, jsonb, text) to authenticated;

create or replace function public.get_fixture_score_template(p_fixture_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare template text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select event.score_template into template from public.fixtures fixture join public.events event on event.id = fixture.event_id where fixture.id = p_fixture_id;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event((select event_id from public.fixtures where id = p_fixture_id)) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return template;
end;
$$;
revoke all on function public.get_fixture_score_template(uuid) from public, anon;
grant execute on function public.get_fixture_score_template(uuid) to authenticated;

-- F18: a schedule is only meaningful when reporting precedes (or equals) start.
-- A successful reschedule always refreshes selected participants' reminders.
create or replace function public.reschedule_fixture(
  p_fixture_id uuid,
  p_reporting_at timestamptz,
  p_starts_at timestamptz,
  p_venue text,
  p_reason text
)
returns public.fixtures
language plpgsql
security definer
set search_path = public
as $$
declare fixture public.fixtures;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_reporting_at is not null and p_starts_at is not null and p_reporting_at > p_starts_at then raise exception 'Reporting time must be before or equal to match start' using errcode = '22023'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if coalesce(nullif(btrim(p_reason), ''), '') = '' then raise exception 'A reschedule reason is required' using errcode = '22023'; end if;
  insert into public.fixture_history(fixture_id, actor_id, previous_schedule, reason)
  values (fixture.id, auth.uid(), jsonb_build_object('reporting_at', fixture.reporting_at, 'starts_at', fixture.starts_at, 'venue', fixture.venue, 'schedule_version', fixture.schedule_version), btrim(p_reason));
  update public.fixtures set reporting_at = p_reporting_at, starts_at = p_starts_at, venue = nullif(btrim(p_venue), ''), schedule_version = fixture.schedule_version + 1, state = case when fixture.state = 'draft' then 'scheduled'::public.fixture_state else fixture.state end
  where id = fixture.id returning * into fixture;
  perform public.generate_fixture_reminders(fixture.id, null);
  return fixture;
end;
$$;
revoke all on function public.reschedule_fixture(uuid, timestamptz, timestamptz, text, text) from public, anon;
grant execute on function public.reschedule_fixture(uuid, timestamptz, timestamptz, text, text) to authenticated;

-- F16: expose a permission-scoped conversation projection for the staff UI.
create or replace function public.get_help_thread_messages(p_thread_id uuid)
returns table (message_id uuid, author_id uuid, author_name text, body text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare thread public.help_threads;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into thread from public.help_threads where id = p_thread_id;
  if not found then raise exception 'Help thread not found' using errcode = 'P0002'; end if;
  if thread.owner_id <> auth.uid() and not (public.is_main_admin() or public.can_manage_access() or (thread.event_id is not null and public.can_manage_event(thread.event_id))) then
    raise exception 'Not authorised for this help thread' using errcode = '42501';
  end if;
  return query
  select message.id, message.author_id, profile.full_name, message.body, message.created_at
  from public.help_messages message join public.profiles profile on profile.id = message.author_id
  where message.thread_id = p_thread_id order by message.created_at asc, message.id asc;
end;
$$;
revoke all on function public.get_help_thread_messages(uuid) from public, anon;
grant execute on function public.get_help_thread_messages(uuid) to authenticated;

-- A participant reply reopens a resolved request for the desk. Closed requests
-- stay immutable, so their final state cannot be silently undone through a raw
-- API request.
create or replace function public.add_help_message(p_thread_id uuid, p_message text)
returns public.help_messages
language plpgsql
security definer
set search_path = public
as $$
declare
  thread public.help_threads;
  message public.help_messages;
  is_owner boolean;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if coalesce(nullif(btrim(p_message), ''), '') = '' then raise exception 'A help message is required' using errcode = '22023'; end if;
  select * into thread from public.help_threads where id = p_thread_id for update;
  if not found then raise exception 'Help thread not found' using errcode = 'P0002'; end if;
  is_owner := thread.owner_id = auth.uid();
  if not is_owner and not (public.is_main_admin() or public.can_manage_access() or (thread.event_id is not null and public.can_manage_event(thread.event_id))) then
    raise exception 'Not authorised for this help thread' using errcode = '42501';
  end if;
  if thread.state = 'closed' then raise exception 'Closed help requests cannot receive new messages' using errcode = '22023'; end if;
  insert into public.help_messages(thread_id, author_id, body) values (p_thread_id, auth.uid(), btrim(p_message)) returning * into message;
  update public.help_threads
  set updated_at = now(),
      state = case
        when is_owner and state = 'resolved' then 'open'::public.help_thread_state
        when not is_owner and state = 'open' then 'in_progress'::public.help_thread_state
        else state
      end
  where id = p_thread_id;
  return message;
end;
$$;
revoke all on function public.add_help_message(uuid, text) from public, anon;
grant execute on function public.add_help_message(uuid, text) to authenticated;

-- F15: UG rolls are now a canonical, digits-only 1-100 identifier. NOT VALID
-- protects all future writes without mutating legacy Auth identities in-place.
alter table public.profiles drop constraint if exists ug_roll_number_1_to_100;
alter table public.profiles add constraint ug_roll_number_1_to_100
  check (participant_category <> 'ug' or roll_canonical ~ '^(?:[1-9]|[1-9][0-9]|100)$') not valid;

notify pgrst, 'reload schema';
