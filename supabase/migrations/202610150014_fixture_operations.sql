-- Event-scoped fixture creation and auditable schedule changes.
create or replace function public.list_event_fixtures(p_event_id uuid)
returns table (
  fixture_id uuid, stage text, participant_a_label text, participant_b_label text, venue text,
  reporting_at timestamptz, starts_at timestamptz, state public.fixture_state, schedule_version integer,
  score_version integer, score_payload jsonb, score_status text, score_updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select f.id, f.stage, f.participant_a_label, f.participant_b_label, f.venue, f.reporting_at, f.starts_at, f.state, f.schedule_version,
    coalesce(s.version, 0), s.score_payload, s.status, s.updated_at
  from public.fixtures f
  left join lateral (
    select version, score_payload, status, updated_at from public.score_snapshots
    where fixture_id = f.id order by version desc limit 1
  ) s on true
  where f.event_id = p_event_id and public.can_manage_event(p_event_id)
  order by f.starts_at nulls last, f.created_at;
$$;
revoke all on function public.list_event_fixtures(uuid) from public;
grant execute on function public.list_event_fixtures(uuid) to authenticated;

create or replace function public.create_fixture(
  p_event_id uuid, p_stage text, p_participant_a_label text, p_participant_b_label text,
  p_venue text default null, p_reporting_at timestamptz default null, p_starts_at timestamptz default null
)
returns public.fixtures
language plpgsql security definer set search_path = public as $$
declare fixture public.fixtures;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if coalesce(nullif(btrim(p_stage), ''), '') = '' or coalesce(nullif(btrim(p_participant_a_label), ''), '') = '' or coalesce(nullif(btrim(p_participant_b_label), ''), '') = '' then raise exception 'Fixture labels are required' using errcode = '22023'; end if;
  if btrim(p_participant_a_label) = btrim(p_participant_b_label) then raise exception 'Fixture participants must differ' using errcode = '22023'; end if;
  insert into public.fixtures (event_id, stage, participant_a_label, participant_b_label, venue, reporting_at, starts_at, created_by)
  values (p_event_id, btrim(p_stage), btrim(p_participant_a_label), btrim(p_participant_b_label), nullif(btrim(p_venue), ''), p_reporting_at, p_starts_at, auth.uid()) returning * into fixture;
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'fixture.created', 'fixture', fixture.id, jsonb_build_object('event_id', p_event_id));
  return fixture;
end;
$$;
revoke all on function public.create_fixture(uuid, text, text, text, text, timestamptz, timestamptz) from public;
grant execute on function public.create_fixture(uuid, text, text, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.update_fixture_schedule(
  p_fixture_id uuid, p_expected_version integer, p_stage text, p_participant_a_label text, p_participant_b_label text,
  p_venue text, p_reporting_at timestamptz, p_starts_at timestamptz, p_state public.fixture_state, p_reason text
)
returns public.fixtures
language plpgsql security definer set search_path = public as $$
declare fixture public.fixtures; previous jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id for update;
  if not found or not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised for this fixture' using errcode = '42501'; end if;
  if fixture.schedule_version <> p_expected_version then raise exception 'Fixture schedule was updated elsewhere' using errcode = '40001'; end if;
  if coalesce(nullif(btrim(p_reason), ''), '') = '' then raise exception 'Schedule change reason is required' using errcode = '22023'; end if;
  previous := jsonb_build_object('stage', fixture.stage, 'participant_a_label', fixture.participant_a_label, 'participant_b_label', fixture.participant_b_label, 'venue', fixture.venue, 'reporting_at', fixture.reporting_at, 'starts_at', fixture.starts_at, 'state', fixture.state, 'schedule_version', fixture.schedule_version);
  update public.fixtures set stage = btrim(p_stage), participant_a_label = btrim(p_participant_a_label), participant_b_label = btrim(p_participant_b_label), venue = nullif(btrim(p_venue), ''), reporting_at = p_reporting_at, starts_at = p_starts_at, state = p_state, schedule_version = schedule_version + 1
  where id = fixture.id returning * into fixture;
  insert into public.fixture_history (fixture_id, actor_id, previous_schedule, reason) values (fixture.id, auth.uid(), previous, btrim(p_reason));
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary) values (auth.uid(), 'fixture.schedule_updated', 'fixture', fixture.id, btrim(p_reason), jsonb_build_object('schedule_version', fixture.schedule_version));
  return fixture;
end;
$$;
revoke all on function public.update_fixture_schedule(uuid, integer, text, text, text, text, timestamptz, timestamptz, public.fixture_state, text) from public;
grant execute on function public.update_fixture_schedule(uuid, integer, text, text, text, text, timestamptz, timestamptz, public.fixture_state, text) to authenticated;
