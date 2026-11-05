-- Council directory identities are separate from committee assignments so one
-- registered student can serve on several committees without duplicate profiles.

create table public.council_committees (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  batch_id uuid not null references public.batches(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  state public.content_state not null default 'draft',
  publish_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, slug)
);

create table public.council_people (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  person_kind text not null check (person_kind in ('faculty', 'student')),
  profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  leadership_role text check (char_length(btrim(leadership_role)) between 1 and 120),
  department text check (char_length(btrim(department)) between 1 and 160),
  batch_id uuid references public.batches(id) on delete restrict,
  roll_canonical text check (char_length(btrim(roll_canonical)) between 1 and 80),
  photo_url text check (photo_url ~ '^https://'),
  photo_alt text check (char_length(photo_alt) <= 300),
  sort_order integer not null default 0,
  state public.content_state not null default 'draft',
  publish_at timestamptz,
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (edition_id, source_key),
  check (
    (person_kind = 'faculty' and profile_id is null and batch_id is null and roll_canonical is null and leadership_role is not null)
    or
    (person_kind = 'student' and batch_id is not null and roll_canonical is not null and leadership_role is null)
  )
);

create unique index council_person_registered_profile_unique
  on public.council_people(edition_id, profile_id)
  where profile_id is not null;

create unique index council_person_batch_roll_unique
  on public.council_people(edition_id, batch_id, roll_canonical)
  where person_kind = 'student';

create table public.council_assignments (
  id uuid primary key default gen_random_uuid(),
  committee_id uuid not null references public.council_committees(id) on delete cascade,
  person_id uuid not null references public.council_people(id) on delete cascade,
  assignment_role text not null check (assignment_role in ('head', 'member')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (committee_id, person_id)
);

create unique index council_one_head_per_committee
  on public.council_assignments(committee_id)
  where assignment_role = 'head';

create function public.prepare_council_person_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  batch_edition uuid;
  matched_profile uuid;
begin
  new.display_name := btrim(new.display_name);
  new.source_key := lower(btrim(new.source_key));

  if new.person_kind = 'faculty' then
    new.profile_id := null;
    new.batch_id := null;
    new.roll_canonical := null;
    return new;
  end if;

  new.roll_canonical := btrim(new.roll_canonical);
  select edition_id into batch_edition from public.batches where id = new.batch_id;
  if batch_edition is distinct from new.edition_id then
    raise exception 'Council student batch does not belong to this edition' using errcode = '22023';
  end if;

  if new.profile_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id
      and p.batch_id = new.batch_id
      and p.roll_canonical = new.roll_canonical
  ) then
    raise exception 'Council profile does not match the supplied batch and roll number' using errcode = '22023';
  end if;

  if new.profile_id is null then
    select p.id into matched_profile
    from public.profiles p
    where p.batch_id = new.batch_id and p.roll_canonical = new.roll_canonical;
    new.profile_id := matched_profile;
  end if;

  return new;
end;
$$;

create trigger council_people_prepare_identity
before insert or update of edition_id, person_kind, profile_id, display_name, batch_id, roll_canonical, source_key
on public.council_people
for each row execute function public.prepare_council_person_identity();

create function public.link_registered_profile_to_council()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.council_people
  set profile_id = null
  where profile_id = new.id
    and (batch_id is distinct from new.batch_id or roll_canonical is distinct from new.roll_canonical);

  if new.batch_id is not null and new.roll_canonical is not null then
    update public.council_people
    set profile_id = new.id
    where person_kind = 'student'
      and batch_id = new.batch_id
      and roll_canonical = new.roll_canonical
      and profile_id is distinct from new.id;
  end if;

  return new;
end;
$$;

create trigger profiles_link_council_identity
after insert or update of batch_id, roll_canonical
on public.profiles
for each row execute function public.link_registered_profile_to_council();

create trigger council_committees_touch_updated_at
before update on public.council_committees
for each row execute function public.touch_updated_at();

create trigger council_people_touch_updated_at
before update on public.council_people
for each row execute function public.touch_updated_at();

alter table public.council_committees enable row level security;
alter table public.council_people enable row level security;
alter table public.council_assignments enable row level security;

revoke all on table public.council_committees, public.council_people, public.council_assignments from public, anon, authenticated;
grant all on table public.council_committees, public.council_people, public.council_assignments to service_role;

create function public.get_public_council_directory()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'leadership', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cp.id,
        'name', cp.display_name,
        'role', cp.leadership_role,
        'department', cp.department,
        'photoUrl', cp.photo_url,
        'photoAlt', cp.photo_alt
      ) order by cp.sort_order, cp.display_name)
      from public.council_people cp
      where cp.edition_id = e.id
        and cp.person_kind = 'faculty'
        and cp.state in ('published', 'scheduled')
        and (cp.publish_at is null or cp.publish_at <= now())
    ), '[]'::jsonb),
    'committees', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cc.id,
        'slug', cc.slug,
        'name', cc.name,
        'batchLabel', b.label,
        'members', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', cp.id,
            'name', coalesce(p.full_name, cp.display_name),
            'role', ca.assignment_role,
            'photoUrl', cp.photo_url,
            'photoAlt', cp.photo_alt,
            'registered', p.id is not null
          ) order by case ca.assignment_role when 'head' then 0 else 1 end, ca.sort_order, coalesce(p.full_name, cp.display_name))
          from public.council_assignments ca
          join public.council_people cp on cp.id = ca.person_id
          left join public.profiles p on p.id = cp.profile_id
            and exists (
              select 1 from public.access_records ar
              where ar.profile_id = p.id
                and ar.edition_id = cp.edition_id
                and ar.state = 'active'
            )
          where ca.committee_id = cc.id
            and cp.person_kind = 'student'
            and cp.state in ('published', 'scheduled')
            and (cp.publish_at is null or cp.publish_at <= now())
        ), '[]'::jsonb)
      ) order by cc.sort_order, cc.name)
      from public.council_committees cc
      join public.batches b on b.id = cc.batch_id
      where cc.edition_id = e.id
        and cc.state in ('published', 'scheduled')
        and (cc.publish_at is null or cc.publish_at <= now())
    ), '[]'::jsonb)
  )
  from public.editions e
  where e.name = 'SPANDAN 4.0'
  order by e.created_at desc
  limit 1;
$$;

revoke all on function public.get_public_council_directory() from public;
grant execute on function public.get_public_council_directory() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
