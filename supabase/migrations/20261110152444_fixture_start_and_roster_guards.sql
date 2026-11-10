-- Require an explicit, authorised start on the scheduled IST date.
alter table public.fixtures add column actual_started_at timestamptz;

-- Preserve historical and already-started matches without treating premature future scores as starts.
update public.fixtures f set actual_started_at = coalesce(
  (select min(s.updated_at) from public.score_snapshots s where s.fixture_id=f.id and s.status in ('live','paused','final')),
  f.updated_at
) where f.state='completed' or (f.state='ongoing' and (f.starts_at at time zone 'Asia/Kolkata')::date <= (now() at time zone 'Asia/Kolkata')::date);
update public.fixtures set state='scheduled' where state='ongoing' and actual_started_at is null;

-- Existing labels stay readable; new team fixtures must use a published captain-named roster.
create or replace function public.guard_fixture_roster()
returns trigger language plpgsql set search_path=public as $$
declare event_format public.event_format; label text; matches integer;
begin
  if new.reporting_at > new.starts_at then raise exception 'Reporting time must be before match start' using errcode='22023'; end if;
  if tg_op='UPDATE' and new.participant_a_label=old.participant_a_label and new.participant_b_label=old.participant_b_label and new.event_id=old.event_id then return new; end if;
  select format into event_format from public.events where id=new.event_id;
  if event_format in ('sport','group','pair') then
    foreach label in array array[new.participant_a_label,new.participant_b_label] loop
      select count(*) into matches from public.participant_groups where event_id=new.event_id and state='published' and name=label;
      if matches <> 1 then raise exception 'Choose an approved, published team or pair with a unique name from this event' using errcode='22023'; end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_fixture_roster() from public,anon,authenticated;
create trigger fixture_roster_guard before insert or update of participant_a_label,participant_b_label,event_id,reporting_at,starts_at on public.fixtures
for each row execute function public.guard_fixture_roster();

create or replace function public.write_score_snapshot(
  p_fixture_id uuid, p_expected_version integer, p_score_payload jsonb, p_status text
)
returns public.score_snapshots language plpgsql security definer set search_path = public as $$
declare
  locked_fixture public.fixtures; parent_event public.events; latest_version integer;
  snapshot public.score_snapshots; next_fixture_state public.fixture_state; value text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_expected_version < 0 or jsonb_typeof(p_score_payload) <> 'object' or p_status not in ('scheduled','live','paused','final','cancelled') then
    raise exception 'Invalid score snapshot' using errcode = '22023';
  end if;
  select * into locked_fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(locked_fixture.event_id) then raise exception 'Not authorised' using errcode = '42501'; end if;
  if locked_fixture.actual_started_at is null then raise exception 'Start this match from Fixtures before scoring' using errcode = '22023'; end if;
  if p_status = 'scheduled' then raise exception 'Use Reschedule to change the match schedule' using errcode = '22023'; end if;
  if locked_fixture.state = 'cancelled' then raise exception 'A cancelled match cannot be scored' using errcode = '22023'; end if;
  select * into parent_event from public.events where id = locked_fixture.event_id;
  if parent_event.score_template in ('football','basketball') and p_score_payload ? 'clock_seconds' then
    if (p_score_payload->>'clock_seconds') !~ '^[0-9]+$'
      or (p_score_payload ? 'clock_running' and jsonb_typeof(p_score_payload->'clock_running') <> 'boolean') then
      raise exception 'Invalid match clock' using errcode = '22023';
    end if;
    if p_score_payload->>'clock_running' = 'true' and p_status <> 'live' then
      p_score_payload := jsonb_set(p_score_payload, '{clock_seconds}', to_jsonb(greatest(0,
        (p_score_payload->>'clock_seconds')::numeric +
        (case when parent_event.score_template='basketball' then -1 else 1 end) *
        greatest(0, floor(extract(epoch from (now() - coalesce((p_score_payload->>'clock_started_at')::timestamptz,now())))))
      )));
      p_score_payload := p_score_payload || '{"clock_running":false,"clock_started_at":null}'::jsonb;
    end if;
  end if;
  if parent_event.score_template = 'football' then
    if (p_score_payload - array['teamA_goals','teamB_goals','penalties','period','clock_seconds','clock_running','clock_started_at','summary']) <> '{}'::jsonb
      or not (p_score_payload ?& array['teamA_goals','teamB_goals']) then raise exception 'Invalid football score' using errcode = '22023'; end if;
    foreach value in array array[p_score_payload->>'teamA_goals', p_score_payload->>'teamB_goals'] loop
      if value !~ '^\d+$' or value::integer > 99 then raise exception 'Invalid football score' using errcode = '22023'; end if;
    end loop;
  elsif parent_event.score_template = 'cricket' then
    if (p_score_payload - array['teamA_runs','teamA_wickets','teamA_overs','teamB_runs','teamB_wickets','teamB_overs','innings','summary']) <> '{}'::jsonb
      or not (p_score_payload ?& array['teamA_runs','teamA_wickets','teamA_overs','teamB_runs','teamB_wickets','teamB_overs']) then raise exception 'Invalid cricket score' using errcode = '22023'; end if;
    if (p_score_payload->>'teamA_overs') !~ '^\d+\.[0-5]$' or (p_score_payload->>'teamB_overs') !~ '^\d+\.[0-5]$' then raise exception 'Invalid cricket overs' using errcode = '22023'; end if;
    if (p_score_payload->>'teamA_runs') !~ '^\d+$' or (p_score_payload->>'teamB_runs') !~ '^\d+$'
      or (p_score_payload->>'teamA_wickets') !~ '^\d+$' or (p_score_payload->>'teamB_wickets') !~ '^\d+$'
      or (p_score_payload->>'teamA_runs')::integer > 999 or (p_score_payload->>'teamB_runs')::integer > 999
      or (p_score_payload->>'teamA_wickets')::integer > 10 or (p_score_payload->>'teamB_wickets')::integer > 10 then
      raise exception 'Invalid cricket score' using errcode = '22023';
    end if;
  elsif parent_event.score_template = 'basketball' then
    if (p_score_payload - array['teamA_score','teamB_score','quarter','teamA_fouls','teamB_fouls','clock_seconds','clock_running','clock_started_at','summary']) <> '{}'::jsonb
      or not (p_score_payload ?& array['teamA_score','teamB_score']) or (p_score_payload->>'teamA_score') !~ '^\d+$'
      or (p_score_payload->>'teamB_score') !~ '^\d+$' or (p_score_payload->>'teamA_score')::integer > 999
      or (p_score_payload->>'teamB_score')::integer > 999 then raise exception 'Invalid basketball score' using errcode = '22023'; end if;
  elsif parent_event.score_template in ('badminton','set_based') then
    if parent_event.score_template = 'badminton' and p_score_payload ? 'set1' then
      if (p_score_payload - array['set1','set2','set3','winner']) <> '{}'::jsonb or (p_score_payload->>'set1') !~ '^\d{1,3}-\d{1,3}$' then raise exception 'Invalid set score' using errcode = '22023'; end if;
    elsif (p_score_payload - array['teamA_points','teamB_points','sets','best_of','winner','summary']) <> '{}'::jsonb
      or not (p_score_payload ?& array['teamA_points','teamB_points','sets']) or jsonb_typeof(p_score_payload->'sets') <> 'array'
      or jsonb_array_length(p_score_payload->'sets') > 9 or (p_score_payload->>'teamA_points') !~ '^\d+$'
      or (p_score_payload->>'teamB_points') !~ '^\d+$' then
      raise exception 'Invalid set score' using errcode = '22023';
    end if;
  else
    if (p_score_payload - array['winner','summary','teamA_score','teamB_score','round']) <> '{}'::jsonb
      or not (coalesce(nullif(btrim(p_score_payload->>'winner'),''), nullif(btrim(p_score_payload->>'summary'),'')) is not null
      or (p_score_payload ?& array['teamA_score','teamB_score'])) then raise exception 'Invalid generic score' using errcode = '22023'; end if;
  end if;
  if p_status in ('live','paused','final') and parent_event.state in ('draft','cancelled') then raise exception 'Event must be published before scoring' using errcode = '22023'; end if;
  if parent_event.state = 'completed' and p_status in ('live','paused') then raise exception 'A completed event cannot return to live scoring' using errcode = '22023'; end if;
  select coalesce(max(version),0) into latest_version from public.score_snapshots where fixture_id = p_fixture_id;
  if latest_version <> p_expected_version then raise exception 'Score was updated elsewhere' using errcode = '40001'; end if;
  insert into public.score_snapshots(fixture_id,version,score_payload,status,updated_by)
    values(p_fixture_id,latest_version+1,p_score_payload,p_status,auth.uid()) returning * into snapshot;
  next_fixture_state := case p_status when 'scheduled' then 'scheduled'::public.fixture_state when 'live' then 'ongoing'::public.fixture_state when 'paused' then 'ongoing'::public.fixture_state when 'final' then 'completed'::public.fixture_state else 'cancelled'::public.fixture_state end;
  update public.fixtures set state = next_fixture_state where id = p_fixture_id;
  if p_status in ('live','paused','final') and parent_event.state in ('published','open','closed') then update public.events set state='ongoing' where id=parent_event.id; end if;
  return snapshot;
end;
$$;
revoke all on function public.write_score_snapshot(uuid, integer, jsonb, text) from public, anon;
grant execute on function public.write_score_snapshot(uuid, integer, jsonb, text) to authenticated;

create or replace function public.prepare_fixture_offline(p_fixture_id uuid, p_device_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  fixture public.fixtures;
  event public.events;
  current_lease public.fixture_score_leases;
  latest public.score_snapshots;
  lease_expiry timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised' using errcode = '42501'; end if;
  if fixture.actual_started_at is null then raise exception 'Start this match from Fixtures before scoring' using errcode = '22023'; end if;
  select * into event from public.events where id = fixture.event_id;
  select * into current_lease from public.fixture_score_leases where fixture_id = fixture.id for update;
  if found and current_lease.revoked_at is null and current_lease.expires_at > now()
     and (current_lease.holder_id <> auth.uid() or current_lease.device_id <> p_device_id) then
    raise exception 'Fixture is prepared on another device' using errcode = '40001';
  end if;
  lease_expiry := greatest(now() + interval '24 hours', coalesce((select (ends_on + 1)::timestamptz from public.editions where id = event.edition_id), now() + interval '7 days'));
  insert into public.fixture_score_leases(fixture_id, device_id, holder_id, expires_at, revoked_at)
  values (fixture.id, p_device_id, auth.uid(), lease_expiry, null)
  on conflict (fixture_id) do update set device_id = excluded.device_id, holder_id = excluded.holder_id,
    prepared_at = now(), expires_at = excluded.expires_at, revoked_at = null, updated_at = now();
  select * into latest from public.score_snapshots where fixture_id = fixture.id order by version desc limit 1;
  return jsonb_build_object(
    'fixtureId', fixture.id, 'eventId', event.id, 'editionId', event.edition_id,
    'eventTitle', event.title, 'stage', fixture.stage,
    'participantALabel', fixture.participant_a_label, 'participantBLabel', fixture.participant_b_label,
    'venue', fixture.venue, 'startsAt', fixture.starts_at, 'actualStartedAt', fixture.actual_started_at, 'scoreTemplate', event.score_template,
    'scoreProvider', fixture.score_provider, 'externalScoreUrl', fixture.external_score_url,
    'serverVersion', coalesce(latest.version, 0), 'status', coalesce(latest.status, 'live'),
    'scorePayload', coalesce(latest.score_payload, '{}'::jsonb), 'userId', auth.uid(),
    'deviceId', p_device_id, 'leaseExpiresAt', lease_expiry
  );
end;
$$;
revoke all on function public.prepare_fixture_offline(uuid, uuid) from public, anon;
grant execute on function public.prepare_fixture_offline(uuid, uuid) to authenticated;


create or replace function public.start_fixture(p_fixture_id uuid)
returns public.fixtures language plpgsql security definer set search_path=public as $$
declare fixture public.fixtures; event public.events; payload jsonb; initial_version integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into fixture from public.fixtures where id=p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode='P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
  if fixture.state in ('completed','cancelled') then raise exception 'This match has already finished or been cancelled' using errcode='22023'; end if;
  if fixture.actual_started_at is not null then return fixture; end if;
  if fixture.starts_at is null or (fixture.starts_at at time zone 'Asia/Kolkata')::date <> (now() at time zone 'Asia/Kolkata')::date then
    raise exception 'Start Match is available only on the scheduled match date (IST). Reschedule if needed.' using errcode='22023';
  end if;
  select * into event from public.events where id=fixture.event_id;
  if event.state in ('draft','cancelled','completed') then raise exception 'This event is not available to start' using errcode='22023'; end if;
  payload := case event.score_template
    when 'football' then jsonb_build_object('teamA_goals',0,'teamB_goals',0,'period','First half','clock_seconds',0,'clock_running',true,'clock_started_at',now())
    when 'basketball' then jsonb_build_object('teamA_score',0,'teamB_score',0,'quarter','Q1','clock_seconds',600,'clock_running',true,'clock_started_at',now())
    when 'cricket' then '{"teamA_runs":0,"teamA_wickets":0,"teamA_overs":"0.0","teamB_runs":0,"teamB_wickets":0,"teamB_overs":"0.0"}'::jsonb
    when 'badminton' then '{"teamA_points":0,"teamB_points":0,"sets":[],"best_of":3}'::jsonb
    when 'set_based' then '{"teamA_points":0,"teamB_points":0,"sets":[],"best_of":3}'::jsonb
    else '{"teamA_score":0,"teamB_score":0}'::jsonb end;
  update public.fixtures set actual_started_at=now(),state='ongoing' where id=fixture.id returning * into fixture;
  select coalesce(max(s.version),0) into initial_version from public.score_snapshots s where s.fixture_id=fixture.id;
  perform public.write_score_snapshot(fixture.id,initial_version,payload,'live');
  if event.score_template='cricket' then update public.score_snapshots set provisional=true where fixture_id=fixture.id and score_snapshots.version=initial_version+1; end if;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
    values(auth.uid(),'fixture.started','fixture',fixture.id,jsonb_build_object('actual_started_at',fixture.actual_started_at));
  return fixture;
end;
$$;
revoke all on function public.start_fixture(uuid) from public,anon;
grant execute on function public.start_fixture(uuid) to authenticated;

-- Old premature scores must not become public when another match goes live.
drop policy if exists score_snapshots_public_read on public.score_snapshots;
create policy score_snapshots_public_read on public.score_snapshots for select to anon,authenticated using (
  provisional=false and exists (
    select 1 from public.fixtures join public.events on events.id=fixtures.event_id
    where fixtures.id=score_snapshots.fixture_id and fixtures.actual_started_at is not null and events.state in ('ongoing','completed')
  )
);
