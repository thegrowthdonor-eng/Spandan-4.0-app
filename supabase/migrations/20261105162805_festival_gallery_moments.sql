-- Candid festival moments are intentionally separate from promotional media and results.
create table public.gallery_moments (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete restrict,
  caption text not null check (char_length(btrim(caption)) between 1 and 1000),
  storage_path text not null unique check (
    storage_path ~ '^gallery/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
  ),
  occurred_at timestamptz not null,
  state public.content_state not null default 'published' check (state in ('published', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'archived') = (archived_at is not null))
);

create index gallery_moments_public_order_idx
  on public.gallery_moments (occurred_at desc, created_at desc)
  where state = 'published';

create index gallery_moments_creator_idx on public.gallery_moments (created_by, created_at desc);
create index gallery_moments_edition_idx on public.gallery_moments (edition_id);
create index gallery_moments_event_idx on public.gallery_moments (event_id);
create index gallery_moments_updater_idx on public.gallery_moments (updated_by);

create trigger gallery_moments_touch_updated_at
before update on public.gallery_moments
for each row execute function public.touch_updated_at();

alter table public.gallery_moments enable row level security;
create policy gallery_moments_no_direct_access on public.gallery_moments
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.gallery_moments from public, anon, authenticated;
grant all on table public.gallery_moments to service_role;

create or replace function public.can_manage_gallery_moments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'role', '') = 'service_role'
    or (
      auth.uid() is not null
      and exists (
        select 1
        from public.profiles p
        join public.batches b on b.id = p.batch_id
        join public.access_records ar
          on ar.profile_id = p.id
         and ar.edition_id = b.edition_id
         and ar.state = 'active'
        join public.staff_assignments sa
          on sa.profile_id = p.id
         and sa.role in ('main_admin', 'event_coordinator')
         and sa.revoked_at is null
        where p.id = auth.uid()
          and upper(regexp_replace(b.label, '^MBBS\s+', '', 'i')) = '2023'
          and b.course_label = 'MBBS'
      )
    );
$$;

create or replace function public.get_published_gallery_moments()
returns table (
  id uuid,
  event_id uuid,
  event_title text,
  event_slug text,
  caption text,
  storage_path text,
  occurred_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select gm.id, e.id, e.title, e.slug, gm.caption, gm.storage_path, gm.occurred_at
  from public.gallery_moments gm
  join public.events e on e.id = gm.event_id and e.edition_id = gm.edition_id
  join public.editions ed on ed.id = gm.edition_id
  where gm.state = 'published'
    and ed.status = 'published'
    and e.state in ('published', 'open', 'closed', 'ongoing', 'completed')
  order by gm.occurred_at desc, gm.created_at desc;
$$;

create or replace function public.list_gallery_event_options()
returns table (event_id uuid, event_title text, starts_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.title, e.starts_at
  from public.events e
  join public.editions ed on ed.id = e.edition_id
  where public.can_manage_gallery_moments()
    and ed.status = 'published'
    and e.state in ('published', 'open', 'closed', 'ongoing', 'completed')
  order by e.starts_at nulls last, e.title;
$$;

create or replace function public.list_manageable_gallery_moments()
returns table (
  id uuid,
  event_id uuid,
  event_title text,
  caption text,
  storage_path text,
  occurred_at timestamptz,
  is_owner boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select gm.id, gm.event_id, e.title, gm.caption, gm.storage_path, gm.occurred_at,
    gm.created_by = auth.uid()
  from public.gallery_moments gm
  join public.events e on e.id = gm.event_id
  where public.can_manage_gallery_moments()
    and gm.state = 'published'
    and (gm.created_by = auth.uid() or public.is_main_admin())
  order by gm.occurred_at desc, gm.created_at desc;
$$;

create or replace function public.create_gallery_moment(
  p_event_id uuid,
  p_caption text,
  p_storage_path text,
  p_occurred_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event public.events;
  created_id uuid;
  clean_caption text := btrim(coalesce(p_caption, ''));
begin
  if not public.can_manage_gallery_moments() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select e.* into target_event
  from public.events e
  join public.editions ed on ed.id = e.edition_id and ed.status = 'published'
  where e.id = p_event_id
    and e.state in ('published', 'open', 'closed', 'ongoing', 'completed');
  if not found then raise exception 'Choose a published event' using errcode = '22023'; end if;
  if char_length(clean_caption) not between 1 and 1000 or p_occurred_at is null then
    raise exception 'Caption and moment time are required' using errcode = '22023';
  end if;
  if p_storage_path !~ ('^gallery/' || auth.uid()::text || '/[0-9a-f-]{36}\.webp$') then
    raise exception 'Invalid gallery storage path' using errcode = '22023';
  end if;

  insert into public.gallery_moments (
    edition_id, event_id, caption, storage_path, occurred_at, created_by, updated_by
  ) values (
    target_event.edition_id, target_event.id, clean_caption, p_storage_path,
    p_occurred_at, auth.uid(), auth.uid()
  ) returning id into created_id;

  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'gallery.moment_published', 'gallery_moment', created_id,
    jsonb_build_object('event_id', target_event.id, 'occurred_at', p_occurred_at));
  return created_id;
end;
$$;

create or replace function public.update_gallery_moment(
  p_moment_id uuid,
  p_event_id uuid,
  p_caption text,
  p_occurred_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  moment public.gallery_moments;
  target_event public.events;
  clean_caption text := btrim(coalesce(p_caption, ''));
begin
  if not public.can_manage_gallery_moments() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into moment from public.gallery_moments where id = p_moment_id and state = 'published' for update;
  if not found or (moment.created_by <> auth.uid() and not public.is_main_admin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select e.* into target_event
  from public.events e
  join public.editions ed on ed.id = e.edition_id and ed.status = 'published'
  where e.id = p_event_id
    and e.state in ('published', 'open', 'closed', 'ongoing', 'completed');
  if not found then raise exception 'Choose a published event' using errcode = '22023'; end if;
  if char_length(clean_caption) not between 1 and 1000 or p_occurred_at is null then
    raise exception 'Caption and moment time are required' using errcode = '22023';
  end if;

  update public.gallery_moments
  set edition_id = target_event.edition_id, event_id = target_event.id,
      caption = clean_caption, occurred_at = p_occurred_at, updated_by = auth.uid()
  where id = moment.id;
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'gallery.moment_updated', 'gallery_moment', moment.id,
    jsonb_build_object('event_id', target_event.id, 'occurred_at', p_occurred_at));
end;
$$;

create or replace function public.archive_gallery_moment(p_moment_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare moment public.gallery_moments;
begin
  if not public.can_manage_gallery_moments() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into moment from public.gallery_moments where id = p_moment_id and state = 'published' for update;
  if not found or (moment.created_by <> auth.uid() and not public.is_main_admin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.gallery_moments
  set state = 'archived', archived_at = now(), updated_by = auth.uid()
  where id = moment.id;
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'gallery.moment_archived', 'gallery_moment', moment.id,
    jsonb_build_object('storage_path', moment.storage_path));
  return moment.storage_path;
end;
$$;

drop policy if exists "Authenticated / Service upload to fest-media" on storage.objects;

revoke all on function public.can_manage_gallery_moments() from public, anon;
revoke all on function public.get_published_gallery_moments() from public;
revoke all on function public.list_gallery_event_options() from public, anon;
revoke all on function public.list_manageable_gallery_moments() from public, anon;
revoke all on function public.create_gallery_moment(uuid, text, text, timestamptz) from public, anon;
revoke all on function public.update_gallery_moment(uuid, uuid, text, timestamptz) from public, anon;
revoke all on function public.archive_gallery_moment(uuid) from public, anon;

grant execute on function public.can_manage_gallery_moments() to authenticated, service_role;
grant execute on function public.get_published_gallery_moments() to anon, authenticated, service_role;
grant execute on function public.list_gallery_event_options() to authenticated, service_role;
grant execute on function public.list_manageable_gallery_moments() to authenticated, service_role;
grant execute on function public.create_gallery_moment(uuid, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.update_gallery_moment(uuid, uuid, text, timestamptz) to authenticated, service_role;
grant execute on function public.archive_gallery_moment(uuid) to authenticated, service_role;
