alter table public.gallery_moments alter column event_id drop not null;

create function private.student_gallery_enabled(p_edition_id uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select exists (
    select 1 from public.editions ed
    where ed.id = p_edition_id and (ed.status = 'published' or (
      ed.status = 'draft' and exists (
        select 1 from public.events e where e.edition_id = ed.id
          and e.state in ('published', 'open', 'closed', 'ongoing', 'completed')
      )
    ))
  );
$$;
revoke all on function private.student_gallery_enabled(uuid) from public, anon, authenticated;

create function private.student_gallery_edition(p_profile_id uuid)
returns uuid
language sql stable
set search_path = ''
as $$
  select b.edition_id
  from public.profiles p
  join public.batches b on b.id = p.batch_id
  join public.access_records ar on ar.profile_id = p.id and ar.edition_id = b.edition_id
  where p.id = p_profile_id and p.participant_category = 'ug'
    and b.course_label = 'MBBS' and upper(regexp_replace(b.label, '^MBBS\s+', '', 'i')) = '2023'
    and ar.state = 'active' and private.student_gallery_enabled(b.edition_id);
$$;
revoke all on function private.student_gallery_edition(uuid) from public, anon, authenticated;

create function public.can_publish_student_gallery_post()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.student_gallery_edition(auth.uid()) is not null;
$$;
revoke all on function public.can_publish_student_gallery_post() from public, anon;
grant execute on function public.can_publish_student_gallery_post() to authenticated;

create function public.publish_student_gallery_post(p_profile_id uuid, p_caption text, p_storage_path text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  target_edition uuid;
  post_id uuid;
begin
  perform 1 from public.profiles where id = p_profile_id for share;
  perform 1 from public.access_records where profile_id = p_profile_id for share;
  target_edition := private.student_gallery_edition(p_profile_id);
  if target_edition is null then
    raise exception 'Posting is limited to active MBBS 2023 students' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_caption)), 0) not between 1 and 1000
    or p_storage_path is null
    or p_storage_path !~ ('^gallery/' || p_profile_id::text || '/[0-9a-f-]{36}\.webp$') then
    raise exception 'Invalid photo or caption' using errcode = '22023';
  end if;

  insert into public.gallery_moments (edition_id, caption, storage_path, occurred_at, created_by, updated_by)
  values (target_edition, btrim(p_caption), p_storage_path, now(), p_profile_id, p_profile_id)
  returning id into post_id;
  insert into public.audit_log (actor_id, action, object_type, object_id)
  values (p_profile_id, 'gallery.student_post_published', 'gallery_moment', post_id);
  return post_id;
end;
$$;
revoke all on function public.publish_student_gallery_post(uuid, text, text) from public, anon, authenticated;
grant execute on function public.publish_student_gallery_post(uuid, text, text) to service_role;

create function public.get_published_gallery_posts()
returns table (id uuid, event_title text, event_slug text, caption text, storage_path text, occurred_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select gm.id, e.title, e.slug, gm.caption, gm.storage_path, gm.occurred_at
  from public.gallery_moments gm
  left join public.events e on e.id = gm.event_id and e.edition_id = gm.edition_id
  where gm.state = 'published' and private.student_gallery_enabled(gm.edition_id)
    and (gm.event_id is null or e.state in ('published', 'open', 'closed', 'ongoing', 'completed'))
  order by gm.occurred_at desc, gm.id;
$$;
revoke all on function public.get_published_gallery_posts() from public;
grant execute on function public.get_published_gallery_posts() to anon, authenticated, service_role;

create or replace function public.list_manageable_gallery_moments()
returns table (id uuid, event_id uuid, event_title text, caption text, storage_path text, occurred_at timestamptz, is_owner boolean)
language sql stable security definer
set search_path = ''
as $$
  select gm.id, gm.event_id, e.title, gm.caption, gm.storage_path, gm.occurred_at, gm.created_by = auth.uid()
  from public.gallery_moments gm
  left join public.events e on e.id = gm.event_id
  where public.can_manage_gallery_moments() and gm.state = 'published'
    and (public.is_main_admin() or (gm.event_id is not null and gm.created_by = auth.uid()))
  order by gm.occurred_at desc, gm.created_at desc;
$$;

create or replace function public.archive_gallery_moment(p_moment_id uuid)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare moment public.gallery_moments;
begin
  if not public.can_manage_gallery_moments() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into moment from public.gallery_moments where id = p_moment_id and state = 'published' for update;
  if not found or ((moment.event_id is null or moment.created_by <> auth.uid()) and not public.is_main_admin()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  update public.gallery_moments set state = 'archived', archived_at = now(), updated_by = auth.uid() where id = moment.id;
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'gallery.moment_archived', 'gallery_moment', moment.id, jsonb_build_object('storage_path', moment.storage_path));
  return moment.storage_path;
end;
$$;

create function private.keep_student_gallery_post_unlinked()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.event_id is null and new.event_id is not null then
    raise exception 'Student gallery posts do not belong to an event' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function private.keep_student_gallery_post_unlinked() from public, anon, authenticated;
create trigger keep_student_gallery_post_unlinked before update of event_id on public.gallery_moments
for each row execute function private.keep_student_gallery_post_unlinked();

create function private.remove_student_gallery_posts()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.gallery_moments where created_by = old.id and event_id is null;
  update public.gallery_moments set updated_by = created_by
    where updated_by = old.id and event_id is null;
  delete from public.media_assets where owner_id = old.id and purpose = 'gallery' and event_id is null;
  return old;
end;
$$;
revoke all on function private.remove_student_gallery_posts() from public, anon, authenticated;
create trigger remove_student_gallery_posts before delete on public.profiles
for each row execute function private.remove_student_gallery_posts();
