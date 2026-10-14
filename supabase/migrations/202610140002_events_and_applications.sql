-- Phase 2: event catalogue and individual applications.
-- Content remains draft until authorised staff publish it; no seed event is included here.

create type public.event_state as enum ('draft', 'published', 'open', 'closed', 'ongoing', 'completed', 'cancelled');
create type public.event_category as enum ('sport', 'cultural', 'literary', 'creative', 'other');
create type public.event_format as enum ('solo', 'pair', 'group', 'sport');
create type public.application_review_state as enum ('submitted', 'approved', 'rejected', 'waitlisted', 'withdrawn');
create type public.selection_state as enum ('unselected', 'selected', 'reserve', 'not_selected', 'removed');

create table public.events (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  category public.event_category not null,
  format public.event_format not null,
  score_template text not null default 'generic' check (score_template in ('generic', 'cricket', 'football', 'badminton')),
  summary text not null default '' check (char_length(summary) <= 600),
  rules_markdown text not null default '' check (char_length(rules_markdown) <= 20000),
  venue text check (char_length(venue) <= 160),
  application_opens_at timestamptz,
  application_closes_at timestamptz,
  roster_lock_at timestamptz,
  reporting_at timestamptz,
  starts_at timestamptz,
  ends_at timestamptz,
  application_capacity integer check (application_capacity is null or application_capacity > 0),
  waitlist_enabled boolean not null default false,
  state public.event_state not null default 'draft',
  eligibility jsonb not null default '{}'::jsonb,
  application_questions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, slug),
  check (application_closes_at is null or application_opens_at is null or application_closes_at > application_opens_at),
  check (ends_at is null or starts_at is null or ends_at >= starts_at)
);

alter table public.staff_assignments
  add constraint staff_assignments_event_id_fkey foreign key (event_id) references public.events(id) on delete cascade;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  idempotency_key uuid not null,
  review_state public.application_review_state not null default 'submitted',
  selection_state public.selection_state not null default 'unselected',
  answers jsonb not null default '{}'::jsonb,
  review_reason text check (char_length(review_reason) <= 500),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, student_id),
  unique (student_id, idempotency_key),
  check ((review_state in ('approved', 'rejected', 'waitlisted')) = (reviewed_at is not null)),
  check ((review_state = 'withdrawn') = (withdrawn_at is not null))
);

create table public.application_history (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  actor_id uuid references public.profiles(id),
  from_review_state public.application_review_state,
  to_review_state public.application_review_state,
  from_selection_state public.selection_state,
  to_selection_state public.selection_state,
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now()
);

create trigger events_touch_updated_at before update on public.events for each row execute function public.touch_updated_at();
create trigger applications_touch_updated_at before update on public.applications for each row execute function public.touch_updated_at();

alter table public.events enable row level security;
alter table public.applications enable row level security;
alter table public.application_history enable row level security;

-- Public read policy allows only pages that have explicitly moved to a published lifecycle state.
create policy events_public_read on public.events for select using (state in ('published', 'open', 'closed', 'ongoing', 'completed', 'cancelled'));
create policy applications_read_own on public.applications for select to authenticated using (student_id = auth.uid());
create policy application_history_read_own on public.application_history for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.student_id = auth.uid()));

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
  application_count integer;
  current_access public.access_records;
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
    p_event_id,
    auth.uid(),
    p_idempotency_key,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity then 'waitlisted'::public.application_review_state else 'submitted'::public.application_review_state end,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity then now() else null end,
    coalesce(p_answers, '{}'::jsonb)
  ) returning * into created_application;

  insert into public.application_history (application_id, actor_id, to_review_state, to_selection_state)
  values (created_application.id, auth.uid(), created_application.review_state, created_application.selection_state);
  return created_application;
end;
$$;

revoke all on function public.apply_to_event(uuid, uuid, jsonb) from public;
grant execute on function public.apply_to_event(uuid, uuid, jsonb) to authenticated;
