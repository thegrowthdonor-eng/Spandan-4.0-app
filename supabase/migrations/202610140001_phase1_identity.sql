-- SPANDAN 4.0 Phase 1 foundation. Apply only through Supabase migrations.
-- Private tables have RLS enabled; public content will use explicit published views in a later migration.

create extension if not exists pgcrypto;
create schema if not exists private;

create type public.access_state as enum ('pending', 'active', 'rejected', 'suspended');
create type public.staff_role as enum ('main_admin', 'treasurer', 'event_head');

create table public.editions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  timezone text not null default 'Asia/Kolkata',
  starts_on date,
  ends_on date,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now()
);

create table public.batches (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 80),
  course_label text,
  eligible boolean not null default true,
  unique (edition_id, label, course_label)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 1 and 100),
  batch_id uuid not null references public.batches(id),
  roll_canonical text not null check (char_length(roll_canonical) between 1 and 80),
  phone_e164 text not null check (phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$'),
  fest_id text not null unique check (fest_id ~ '^SPD-[A-Z0-9]{6,16}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, roll_canonical)
);

create table public.access_records (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  state public.access_state not null default 'pending',
  verified_by uuid references public.profiles(id),
  verified_at timestamptz,
  ledger_reference text check (char_length(ledger_reference) <= 120),
  reason text check (char_length(reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, profile_id),
  check ((state = 'active') = (verified_at is not null))
);

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.staff_role not null,
  event_id uuid, -- FK added with the events migration, avoiding a fake placeholder event table.
  granted_by uuid references public.profiles(id),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  check ((role = 'event_head' and event_id is not null) or (role <> 'event_head' and event_id is null))
);

create unique index active_global_staff_assignment on public.staff_assignments(profile_id, role)
  where revoked_at is null and event_id is null;
create unique index active_event_head_assignment on public.staff_assignments(profile_id, event_id)
  where revoked_at is null and role = 'event_head';

-- The identity mapping is deliberately private. Its identifier value must be produced by server code.
create table private.auth_identity_map (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  auth_phone_e164 text not null unique check (auth_phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$'),
  created_at timestamptz not null default now()
);
revoke all on table private.auth_identity_map from anon, authenticated;
alter table private.auth_identity_map enable row level security;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(action) between 1 and 120),
  object_type text not null check (char_length(object_type) between 1 and 80),
  object_id uuid,
  reason text check (char_length(reason) <= 500),
  change_summary jsonb not null default '{}'::jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);

alter table public.editions enable row level security;
alter table public.batches enable row level security;
alter table public.profiles enable row level security;
alter table public.access_records enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.audit_log enable row level security;

-- Profile owners can read their own private data. All role changes and access changes must go via
-- SECURITY DEFINER RPCs introduced with the staff-operation migration after event rules exist.
create policy profiles_read_own on public.profiles for select to authenticated using (id = auth.uid());
create policy access_read_own on public.access_records for select to authenticated using (profile_id = auth.uid());

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$ begin new.updated_at = now(); return new; end; $$;
create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger access_records_touch_updated_at before update on public.access_records for each row execute function public.touch_updated_at();
