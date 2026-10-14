-- Phase 4: announcements, reminders, polls, feedback and private help.
-- Browser push is deliberately not a persistence dependency; the in-app reminder is canonical.

create type public.notice_audience as enum ('public', 'active_students', 'event_participants');
create type public.notice_urgency as enum ('normal', 'important', 'urgent');
create type public.help_thread_state as enum ('open', 'in_progress', 'resolved', 'closed');

create table public.notices (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  audience public.notice_audience not null default 'public',
  urgency public.notice_urgency not null default 'normal',
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  published_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at is null or expires_at > publish_at),
  check ((audience = 'event_participants') = (event_id is not null))
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  source_version text not null check (char_length(source_version) between 1 and 160),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text check (char_length(body) <= 1000),
  due_at timestamptz not null,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (profile_id, source_version)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  question text not null check (char_length(btrim(question)) between 1 and 300),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  show_totals_before_close boolean not null default false,
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 160),
  sort_order integer not null check (sort_order >= 0),
  unique (poll_id, sort_order),
  unique (poll_id, label)
);

create table public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  unique (poll_id, profile_id)
);

create table public.feedback_responses (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  form_key text not null check (form_key ~ '^[a-z0-9-]{1,80}$'),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null check (jsonb_typeof(answers) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index one_global_feedback_per_form on public.feedback_responses(edition_id, form_key, profile_id) where event_id is null;
create unique index one_event_feedback_per_form on public.feedback_responses(event_id, form_key, profile_id) where event_id is not null;

create table public.help_threads (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  subject text not null check (char_length(btrim(subject)) between 1 and 160),
  state public.help_thread_state not null default 'open',
  assigned_to uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.help_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.help_threads(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);

create trigger notices_touch_updated_at before update on public.notices for each row execute function public.touch_updated_at();
create trigger feedback_touch_updated_at before update on public.feedback_responses for each row execute function public.touch_updated_at();
create trigger help_threads_touch_updated_at before update on public.help_threads for each row execute function public.touch_updated_at();

alter table public.notices enable row level security;
alter table public.reminders enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.feedback_responses enable row level security;
alter table public.help_threads enable row level security;
alter table public.help_messages enable row level security;

create policy public_notices_read on public.notices for select using (audience = 'public' and publish_at <= now() and (expires_at is null or expires_at > now()));
create policy reminders_read_own on public.reminders for select to authenticated using (profile_id = auth.uid());
create policy polls_read_published on public.polls for select using (published_at is not null and published_at <= now());
create policy poll_options_read_published on public.poll_options for select using (exists (select 1 from public.polls where polls.id = poll_options.poll_id and published_at is not null and published_at <= now()));
create policy feedback_read_own on public.feedback_responses for select to authenticated using (profile_id = auth.uid());
create policy help_threads_read_own on public.help_threads for select to authenticated using (owner_id = auth.uid());
create policy help_messages_read_own on public.help_messages for select to authenticated using (exists (select 1 from public.help_threads where id = thread_id and owner_id = auth.uid()));

create or replace function public.cast_poll_vote(p_poll_id uuid, p_option_id uuid)
returns public.poll_votes
language plpgsql security definer set search_path = public as $$
declare
  locked_poll public.polls;
  existing_vote public.poll_votes;
  vote public.poll_votes;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into locked_poll from public.polls where id = p_poll_id for update;
  if not found or locked_poll.published_at is null or locked_poll.published_at > now() then raise exception 'Poll is unavailable' using errcode = '22023'; end if;
  if now() < locked_poll.opens_at or now() >= locked_poll.closes_at then raise exception 'Poll is closed' using errcode = '22023'; end if;
  if not exists (select 1 from public.access_records where edition_id = locked_poll.edition_id and profile_id = auth.uid() and state = 'active') then raise exception 'Account is not active for voting' using errcode = '42501'; end if;
  if not exists (select 1 from public.poll_options where id = p_option_id and poll_id = p_poll_id) then raise exception 'Invalid poll option' using errcode = '22023'; end if;
  select * into existing_vote from public.poll_votes where poll_id = p_poll_id and profile_id = auth.uid();
  if found then return existing_vote; end if;
  insert into public.poll_votes (poll_id, option_id, profile_id) values (p_poll_id, p_option_id, auth.uid()) returning * into vote;
  return vote;
end;
$$;

create or replace function public.submit_feedback(
  p_edition_id uuid, p_event_id uuid, p_form_key text, p_answers jsonb
)
returns public.feedback_responses
language plpgsql security definer set search_path = public as $$
declare
  response public.feedback_responses;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid feedback' using errcode = '22023'; end if;
  if not exists (select 1 from public.access_records where edition_id = p_edition_id and profile_id = auth.uid() and state = 'active') then raise exception 'Account is not active for feedback' using errcode = '42501'; end if;
  if p_event_id is null then
    insert into public.feedback_responses (edition_id, event_id, form_key, profile_id, answers) values (p_edition_id, null, p_form_key, auth.uid(), p_answers)
    on conflict (edition_id, form_key, profile_id) where event_id is null do update set answers = excluded.answers, version = public.feedback_responses.version + 1, updated_at = now() returning * into response;
  else
    if not exists (select 1 from public.events where id = p_event_id and edition_id = p_edition_id) then raise exception 'Invalid event feedback scope' using errcode = '22023'; end if;
    insert into public.feedback_responses (edition_id, event_id, form_key, profile_id, answers) values (p_edition_id, p_event_id, p_form_key, auth.uid(), p_answers)
    on conflict (event_id, form_key, profile_id) where event_id is not null do update set answers = excluded.answers, version = public.feedback_responses.version + 1, updated_at = now() returning * into response;
  end if;
  return response;
end;
$$;

revoke all on function public.cast_poll_vote(uuid, uuid) from public;
grant execute on function public.cast_poll_vote(uuid, uuid) to authenticated;
revoke all on function public.submit_feedback(uuid, uuid, text, jsonb) from public;
grant execute on function public.submit_feedback(uuid, uuid, text, jsonb) to authenticated;

create or replace function public.create_help_thread(
  p_edition_id uuid, p_event_id uuid, p_subject text, p_message text
)
returns public.help_threads
language plpgsql security definer set search_path = public as $$
declare
  thread public.help_threads;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.access_records where edition_id = p_edition_id and profile_id = auth.uid() and state in ('pending', 'active')) then raise exception 'Account cannot open help' using errcode = '42501'; end if;
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id and edition_id = p_edition_id) then raise exception 'Invalid event help scope' using errcode = '22023'; end if;
  insert into public.help_threads (edition_id, owner_id, event_id, subject) values (p_edition_id, auth.uid(), p_event_id, p_subject) returning * into thread;
  insert into public.help_messages (thread_id, author_id, body) values (thread.id, auth.uid(), p_message);
  return thread;
end;
$$;

create or replace function public.add_help_message(p_thread_id uuid, p_message text)
returns public.help_messages
language plpgsql security definer set search_path = public as $$
declare
  thread public.help_threads;
  message public.help_messages;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into thread from public.help_threads where id = p_thread_id for update;
  if not found then raise exception 'Help thread not found' using errcode = 'P0002'; end if;
  if thread.owner_id <> auth.uid() and thread.assigned_to is distinct from auth.uid() and not exists (select 1 from public.staff_assignments where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null) then raise exception 'Not authorised for this help thread' using errcode = '42501'; end if;
  insert into public.help_messages (thread_id, author_id, body) values (p_thread_id, auth.uid(), p_message) returning * into message;
  update public.help_threads set updated_at = now(), state = case when state = 'open' then 'in_progress'::public.help_thread_state else state end where id = p_thread_id;
  return message;
end;
$$;

revoke all on function public.create_help_thread(uuid, uuid, text, text) from public;
grant execute on function public.create_help_thread(uuid, uuid, text, text) to authenticated;
revoke all on function public.add_help_message(uuid, text) from public;
grant execute on function public.add_help_message(uuid, text) to authenticated;
