-- Offline-first scoring, programme live states and public-provider metadata.
-- Existing fixture/snapshot tables remain authoritative; this migration adds
-- device leases and idempotent checkpoint sync without introducing Realtime.

alter table public.events drop constraint if exists events_score_template_check;
alter table public.events add constraint events_score_template_check
  check (score_template in ('generic', 'cricket', 'football', 'badminton', 'basketball', 'set_based'));

alter table public.fixtures add column if not exists score_provider text not null default 'internal';
alter table public.fixtures add column if not exists external_score_url text;
alter table public.fixtures drop constraint if exists fixtures_score_provider_check;
alter table public.fixtures add constraint fixtures_score_provider_check check (score_provider in ('internal', 'cricheroes'));
alter table public.fixtures drop constraint if exists fixtures_external_score_url_check;
alter table public.fixtures add constraint fixtures_external_score_url_check check (
  external_score_url is null or external_score_url ~ '^https://(www\.)?cricheroes\.com/'
);

alter table public.score_snapshots add column if not exists client_mutation_id uuid;
alter table public.score_snapshots add column if not exists source text not null default 'online';
alter table public.score_snapshots add column if not exists provisional boolean not null default false;
alter table public.score_snapshots add column if not exists client_recorded_at timestamptz;
alter table public.score_snapshots drop constraint if exists score_snapshots_source_check;
alter table public.score_snapshots add constraint score_snapshots_source_check
  check (source in ('online', 'offline_sync', 'admin_correction'));
create unique index if not exists score_snapshots_client_mutation_id_idx
  on public.score_snapshots(client_mutation_id) where client_mutation_id is not null;

create table if not exists public.score_sync_failure_counts (
  day date not null default current_date,
  failure_code text not null check (char_length(failure_code) between 1 and 32),
  failures integer not null default 1 check (failures > 0),
  updated_at timestamptz not null default now(),
  primary key (day, failure_code)
);
alter table public.score_sync_failure_counts enable row level security;

create or replace function public.record_score_sync_failure(p_failure_code text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.score_sync_failure_counts(day,failure_code,failures,updated_at)
  values(current_date,left(coalesce(nullif(p_failure_code,''),'unknown'),32),1,now())
  on conflict(day,failure_code) do update set failures=score_sync_failure_counts.failures+1,updated_at=now();
end;
$$;
revoke all on function public.record_score_sync_failure(text) from public, anon;
grant execute on function public.record_score_sync_failure(text) to authenticated;

create table if not exists public.fixture_score_leases (
  fixture_id uuid primary key references public.fixtures(id) on delete cascade,
  device_id uuid not null,
  holder_id uuid not null references public.profiles(id),
  prepared_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.fixture_score_leases enable row level security;

-- Promote the brochure schedule table to the normal migration path. The
-- production import remains repeat-safe and can continue inserting its rows.
create table if not exists public.schedule_entries (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  source_key text not null,
  day date not null,
  title text not null check (char_length(title) between 1 and 160),
  category text not null check (category in ('opening','sport','cultural','evening')),
  venue text,
  starts_at timestamptz,
  ends_at timestamptz,
  notes text not null default '',
  sort_order integer not null default 0,
  source_page integer,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (edition_id, source_key),
  check (ends_at is null or (starts_at is not null and ends_at >= starts_at)),
  check (starts_at is null or (starts_at at time zone 'Asia/Kolkata')::date = day)
);
alter table public.schedule_entries enable row level security;
drop policy if exists schedule_public_read on public.schedule_entries;
create policy schedule_public_read on public.schedule_entries for select to anon, authenticated using (published);
grant select on public.schedule_entries to anon, authenticated;
grant all on public.schedule_entries to service_role;
create index if not exists schedule_entries_day_idx on public.schedule_entries(edition_id, day, sort_order);

create table if not exists public.programme_live_states (
  schedule_entry_id uuid primary key references public.schedule_entries(id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled','live','paused','completed','cancelled')),
  update_note text check (char_length(update_note) <= 500),
  actual_started_at timestamptz,
  actual_ended_at timestamptz,
  version integer not null default 1 check (version > 0),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
alter table public.programme_live_states enable row level security;
drop policy if exists programme_live_states_public_read on public.programme_live_states;
create policy programme_live_states_public_read on public.programme_live_states for select to anon, authenticated using (
  exists (select 1 from public.schedule_entries entry where entry.id = schedule_entry_id and entry.published)
);
grant select on public.programme_live_states to anon, authenticated;

create or replace function public.can_manage_live_desk()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_active_festival_access()
    and exists (
      select 1 from public.staff_assignments
      where profile_id = auth.uid() and revoked_at is null
        and role in ('main_admin', 'event_coordinator')
    );
$$;
revoke all on function public.can_manage_live_desk() from public, anon;
grant execute on function public.can_manage_live_desk() to authenticated;

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
    'venue', fixture.venue, 'startsAt', fixture.starts_at, 'scoreTemplate', event.score_template,
    'scoreProvider', fixture.score_provider, 'externalScoreUrl', fixture.external_score_url,
    'serverVersion', coalesce(latest.version, 0), 'status', coalesce(latest.status, 'scheduled'),
    'scorePayload', coalesce(latest.score_payload, '{}'::jsonb), 'userId', auth.uid(),
    'deviceId', p_device_id, 'leaseExpiresAt', lease_expiry
  );
end;
$$;
revoke all on function public.prepare_fixture_offline(uuid, uuid) from public, anon;
grant execute on function public.prepare_fixture_offline(uuid, uuid) to authenticated;

create or replace function public.release_fixture_score_lease(p_fixture_id uuid, p_device_id uuid, p_force boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare lease public.fixture_score_leases;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into lease from public.fixture_score_leases where fixture_id = p_fixture_id for update;
  if not found then return; end if;
  if not public.is_main_admin() and (p_force or lease.holder_id <> auth.uid() or lease.device_id <> p_device_id) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.fixture_score_leases set revoked_at = now(), updated_at = now() where fixture_id = p_fixture_id;
end;
$$;
revoke all on function public.release_fixture_score_lease(uuid, uuid, boolean) from public, anon;
grant execute on function public.release_fixture_score_lease(uuid, uuid, boolean) to authenticated;

-- Expanded validation remains at the database trust boundary.
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
  select * into parent_event from public.events where id = locked_fixture.event_id;
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

create or replace function public.sync_score_checkpoints(
  p_fixture_id uuid, p_device_id uuid, p_base_version integer, p_checkpoints jsonb
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  lease public.fixture_score_leases; checkpoint jsonb; mutation uuid; current_version integer := p_base_version;
  existing_version integer; existing_fixture uuid; written public.score_snapshots; applied jsonb := '[]'::jsonb; last_revision integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_checkpoints) <> 'array' or jsonb_array_length(p_checkpoints) < 1 or jsonb_array_length(p_checkpoints) > 50 then raise exception 'Invalid checkpoints' using errcode = '22023'; end if;
  select * into lease from public.fixture_score_leases where fixture_id = p_fixture_id for update;
  if not found or lease.revoked_at is not null or lease.expires_at <= now() or lease.holder_id <> auth.uid() or lease.device_id <> p_device_id then raise exception 'Scoring device lease is not active' using errcode = '42501'; end if;
  for checkpoint in select value from jsonb_array_elements(p_checkpoints) loop
    begin mutation := (checkpoint->>'clientMutationId')::uuid; exception when others then raise exception 'Invalid mutation ID' using errcode='22023'; end;
    if coalesce((checkpoint->>'localRevision')::integer,0) <= last_revision then raise exception 'Checkpoints are not ordered' using errcode='22023'; end if;
    last_revision := (checkpoint->>'localRevision')::integer;
    select version,fixture_id into existing_version,existing_fixture from public.score_snapshots where client_mutation_id = mutation;
    if found then
      if existing_fixture <> p_fixture_id then raise exception 'Mutation belongs to another fixture' using errcode='22023'; end if;
      current_version := existing_version;
    else
      written := public.write_score_snapshot(p_fixture_id,current_version,checkpoint->'scorePayload',checkpoint->>'status');
      update public.score_snapshots set client_mutation_id=mutation, source='offline_sync',
        provisional=coalesce((checkpoint->>'provisional')::boolean,false),
        client_recorded_at=nullif(checkpoint->>'recordedAt','')::timestamptz where id=written.id;
      current_version := written.version;
    end if;
    applied := applied || jsonb_build_array(mutation);
  end loop;
  return jsonb_build_object('version',current_version,'applied',applied,'syncedAt',now());
end;
$$;
revoke all on function public.sync_score_checkpoints(uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.sync_score_checkpoints(uuid, uuid, integer, jsonb) to authenticated;

create or replace function public.reconcile_cricket_score(p_fixture_id uuid, p_cricheroes_url text)
returns void language plpgsql security definer set search_path=public as $$
declare fixture public.fixtures; template text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into fixture from public.fixtures where id=p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode='P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
  select score_template into template from public.events where id=fixture.event_id;
  if template <> 'cricket' or p_cricheroes_url !~ '^https://(www\.)?cricheroes\.com/' then raise exception 'A valid CricHeroes cricket link is required' using errcode='22023'; end if;
  update public.fixtures set score_provider='cricheroes',external_score_url=p_cricheroes_url where id=p_fixture_id;
  update public.score_snapshots set provisional=false where id=(select id from public.score_snapshots where fixture_id=p_fixture_id order by version desc limit 1);
end;
$$;
revoke all on function public.reconcile_cricket_score(uuid,text) from public, anon;
grant execute on function public.reconcile_cricket_score(uuid,text) to authenticated;

drop policy if exists score_snapshots_public_read on public.score_snapshots;
create policy score_snapshots_public_read on public.score_snapshots for select using (
  provisional = false and exists (
    select 1 from public.fixtures join public.events on events.id = fixtures.event_id
    where fixtures.id = score_snapshots.fixture_id and events.state in ('ongoing','completed')
  )
);

create or replace function public.manage_programme_live_entry(
  p_schedule_entry_id uuid, p_status text, p_update_note text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_venue text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare current_state public.programme_live_states; next_version integer; started timestamptz; ended timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  if not public.can_manage_live_desk() then raise exception 'Not authorised' using errcode='42501'; end if;
  if p_status not in ('scheduled','live','paused','completed','cancelled') then raise exception 'Invalid live status' using errcode='22023'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at < p_starts_at then raise exception 'End must follow start' using errcode='22023'; end if;
  if not exists(select 1 from public.schedule_entries where id=p_schedule_entry_id) then raise exception 'Programme entry not found' using errcode='P0002'; end if;
  update public.schedule_entries set starts_at=p_starts_at, ends_at=p_ends_at, venue=nullif(btrim(p_venue),'') where id=p_schedule_entry_id;
  select * into current_state from public.programme_live_states where schedule_entry_id=p_schedule_entry_id for update;
  next_version := coalesce(current_state.version,0)+1;
  started := case when p_status='live' then coalesce(current_state.actual_started_at,now()) else current_state.actual_started_at end;
  ended := case when p_status in ('completed','cancelled') then now() when p_status in ('scheduled','live','paused') then null else current_state.actual_ended_at end;
  insert into public.programme_live_states(schedule_entry_id,status,update_note,actual_started_at,actual_ended_at,version,updated_by,updated_at)
    values(p_schedule_entry_id,p_status,nullif(btrim(p_update_note),''),started,ended,next_version,auth.uid(),now())
  on conflict(schedule_entry_id) do update set status=excluded.status, update_note=excluded.update_note,
    actual_started_at=excluded.actual_started_at, actual_ended_at=excluded.actual_ended_at,
    version=excluded.version, updated_by=excluded.updated_by, updated_at=now();
  return jsonb_build_object('version',next_version,'status',p_status);
end;
$$;
revoke all on function public.manage_programme_live_entry(uuid,text,text,timestamptz,timestamptz,text) from public, anon;
grant execute on function public.manage_programme_live_entry(uuid,text,text,timestamptz,timestamptz,text) to authenticated;

create or replace function public.list_programme_live_desk()
returns table(id uuid, day date, title text, category text, venue text, starts_at timestamptz, ends_at timestamptz,
  status text, update_note text, version integer, updated_at timestamptz)
language sql stable security definer set search_path=public as $$
  select entry.id,entry.day,entry.title,entry.category,entry.venue,entry.starts_at,entry.ends_at,
    coalesce(state.status,'scheduled'),state.update_note,coalesce(state.version,0),state.updated_at
  from public.schedule_entries entry left join public.programme_live_states state on state.schedule_entry_id=entry.id
  where entry.published and public.can_manage_live_desk() order by entry.day,entry.sort_order;
$$;
revoke all on function public.list_programme_live_desk() from public, anon;
grant execute on function public.list_programme_live_desk() to authenticated;

create or replace function public.export_live_ground_data()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  return jsonb_build_object(
    'exportedAt', now(),
    'fixtures', coalesce((select jsonb_agg(to_jsonb(fixture)) from public.fixtures fixture), '[]'::jsonb),
    'scores', coalesce((select jsonb_agg(to_jsonb(score)) from public.score_snapshots score), '[]'::jsonb),
    'programme', coalesce((select jsonb_agg(to_jsonb(entry)) from public.schedule_entries entry), '[]'::jsonb),
    'programmeStates', coalesce((select jsonb_agg(to_jsonb(state)) from public.programme_live_states state), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.export_live_ground_data() from public, anon;
grant execute on function public.export_live_ground_data() to authenticated;

create or replace function public.live_ground_diagnostics()
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.can_manage_live_desk() then raise exception 'Not authorised' using errcode='42501'; end if;
  return jsonb_build_object(
    'scoreSnapshots', (select count(*) from public.score_snapshots),
    'scorePayloadBytes', (select coalesce(sum(pg_column_size(score_payload)),0) from public.score_snapshots),
    'activeLeases', (select count(*) from public.fixture_score_leases where revoked_at is null and expires_at > now()),
    'provisionalCricket', (select count(*) from public.score_snapshots where provisional),
    'syncFailures', (select coalesce(sum(failures),0) from public.score_sync_failure_counts where day >= current_date-7)
  );
end;
$$;
revoke all on function public.live_ground_diagnostics() from public, anon;
grant execute on function public.live_ground_diagnostics() to authenticated;

notify pgrst, 'reload schema';
