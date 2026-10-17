-- Phase 3: fixtures, versioned live scores, final results and derived batch points.
-- No points are seeded. Publication is intentionally blocked until the committee configures rules.

create type public.fixture_state as enum ('draft', 'scheduled', 'ongoing', 'completed', 'cancelled');
create type public.result_publication_state as enum ('draft', 'published', 'superseded');

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_assignments
    where profile_id = auth.uid() and revoked_at is null
      and (role = 'main_admin' or (role = 'event_head' and event_id = p_event_id))
  );
$$;

revoke all on function public.can_manage_event(uuid) from public;
grant execute on function public.can_manage_event(uuid) to authenticated;

create table public.fixtures (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  stage text not null check (char_length(btrim(stage)) between 1 and 100),
  participant_a_label text not null check (char_length(btrim(participant_a_label)) between 1 and 160),
  participant_b_label text not null check (char_length(btrim(participant_b_label)) between 1 and 160),
  venue text check (char_length(venue) <= 160),
  reporting_at timestamptz,
  starts_at timestamptz,
  state public.fixture_state not null default 'draft',
  schedule_version integer not null default 1 check (schedule_version > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (participant_a_label <> participant_b_label)
);

create table public.fixture_history (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  previous_schedule jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table public.score_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id uuid not null references public.fixtures(id) on delete cascade,
  version integer not null check (version > 0),
  score_payload jsonb not null check (jsonb_typeof(score_payload) = 'object'),
  status text not null check (status in ('scheduled', 'live', 'paused', 'final', 'cancelled')),
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique (fixture_id, version)
);

create table public.point_rules (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  "placing" integer not null check ("placing" > 0),
  points integer not null check (points >= 0),
  configured_by uuid not null references public.profiles(id),
  configured_at timestamptz not null default now(),
  unique (event_id, "placing")
);

create table public.result_publications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  version integer not null check (version > 0),
  state public.result_publication_state not null default 'draft',
  reason text check (char_length(reason) <= 500),
  published_by uuid references public.profiles(id),
  published_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (event_id, version),
  check ((state = 'published') = (published_at is not null)),
  check ((state = 'superseded') = (superseded_at is not null))
);

create unique index one_published_result_per_event on public.result_publications(event_id) where state = 'published';

create table public.result_positions (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.result_publications(id) on delete cascade,
  "placing" integer not null check ("placing" > 0),
  batch_id uuid not null references public.batches(id),
  note text check (char_length(note) <= 500),
  unique (publication_id, "placing"),
  unique (publication_id, batch_id)
);

create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.result_publications(id) on delete restrict,
  batch_id uuid not null references public.batches(id),
  points integer not null check (points >= 0),
  created_at timestamptz not null default now(),
  unique (publication_id, batch_id)
);

create trigger fixtures_touch_updated_at before update on public.fixtures for each row execute function public.touch_updated_at();

alter table public.fixtures enable row level security;
alter table public.fixture_history enable row level security;
alter table public.score_snapshots enable row level security;
alter table public.point_rules enable row level security;
alter table public.result_publications enable row level security;
alter table public.result_positions enable row level security;
alter table public.points_ledger enable row level security;

create policy fixtures_public_read on public.fixtures for select using (
  exists (select 1 from public.events where events.id = fixtures.event_id and events.state in ('published', 'open', 'closed', 'ongoing', 'completed', 'cancelled'))
);
create policy score_snapshots_public_read on public.score_snapshots for select using (
  exists (select 1 from public.fixtures join public.events on events.id = fixtures.event_id where fixtures.id = score_snapshots.fixture_id and events.state in ('ongoing', 'completed'))
);
create policy results_public_read on public.result_publications for select using (state = 'published');
create policy result_positions_public_read on public.result_positions for select using (exists (select 1 from public.result_publications where id = publication_id and state = 'published'));
create policy points_ledger_public_read on public.points_ledger for select using (exists (select 1 from public.result_publications where id = publication_id and state = 'published'));

create or replace function public.write_score_snapshot(
  p_fixture_id uuid,
  p_expected_version integer,
  p_score_payload jsonb,
  p_status text
)
returns public.score_snapshots
language plpgsql security definer set search_path = public as $$
declare
  locked_fixture public.fixtures;
  latest_version integer;
  snapshot public.score_snapshots;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into locked_fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(locked_fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if jsonb_typeof(p_score_payload) <> 'object' or p_status not in ('scheduled', 'live', 'paused', 'final', 'cancelled') then raise exception 'Invalid score snapshot' using errcode = '22023'; end if;
  select coalesce(max(version), 0) into latest_version from public.score_snapshots where fixture_id = p_fixture_id;
  if latest_version <> p_expected_version then raise exception 'Score was updated elsewhere' using errcode = '40001'; end if;
  insert into public.score_snapshots (fixture_id, version, score_payload, status, updated_by)
  values (p_fixture_id, latest_version + 1, p_score_payload, p_status, auth.uid()) returning * into snapshot;
  return snapshot;
end;
$$;

create or replace function public.publish_result_positions(
  p_event_id uuid,
  p_positions jsonb,
  p_reason text default null
)
returns public.result_publications
language plpgsql security definer set search_path = public as $$
declare
  locked_event public.events;
  prior_publication public.result_publications;
  publication public.result_publications;
  next_version integer;
  position jsonb;
  target_batch uuid;
  target_place integer;
  configured_points integer;
  had_prior boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then raise exception 'At least one final position is required' using errcode = '22023'; end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  select * into prior_publication from public.result_publications where event_id = p_event_id and state = 'published' for update;
  had_prior := found;
  if had_prior and coalesce(nullif(btrim(p_reason), ''), '') = '' then raise exception 'A correction reason is required' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.result_publications where event_id = p_event_id;
  insert into public.result_publications (event_id, version, state, reason, published_by, published_at)
  values (p_event_id, next_version, 'published', nullif(btrim(p_reason), ''), auth.uid(), now()) returning * into publication;
  for position in select value from jsonb_array_elements(p_positions) loop
    target_place := (position ->> 'placing')::integer;
    target_batch := (position ->> 'batch_id')::uuid;
    if target_place is null or target_place < 1 or target_batch is null then raise exception 'Invalid final position' using errcode = '22023'; end if;
    if not exists (select 1 from public.batches where id = target_batch and edition_id = locked_event.edition_id) then raise exception 'Result batch is not eligible for this edition' using errcode = '22023'; end if;
    select points into configured_points from public.point_rules where event_id = p_event_id and "placing" = target_place;
    if not found then raise exception 'Points are not configured for placing %', target_place using errcode = '22023'; end if;
    insert into public.result_positions (publication_id, "placing", batch_id, note) values (publication.id, target_place, target_batch, nullif(position ->> 'note', ''));
    insert into public.points_ledger (publication_id, batch_id, points) values (publication.id, target_batch, configured_points);
  end loop;
  if had_prior then update public.result_publications set state = 'superseded', superseded_at = now() where id = prior_publication.id; end if;
  return publication;
exception when others then
  raise;
end;
$$;

revoke all on function public.write_score_snapshot(uuid, integer, jsonb, text) from public;
grant execute on function public.write_score_snapshot(uuid, integer, jsonb, text) to authenticated;
revoke all on function public.publish_result_positions(uuid, jsonb, text) from public;
grant execute on function public.publish_result_positions(uuid, jsonb, text) to authenticated;

create view public.published_batch_standings with (security_invoker = true) as
  select ledger.batch_id, sum(ledger.points)::integer as points
  from public.points_ledger ledger
  join public.result_publications publication on publication.id = ledger.publication_id
  where publication.state = 'published'
  group by ledger.batch_id;
