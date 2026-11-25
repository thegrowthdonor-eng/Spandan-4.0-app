-- Isolated local database only.
do $$ begin
  if current_setting('spandan.isolated_tests', true) is distinct from 'on' then
    raise exception 'An isolated test database is required';
  end if;
end $$;
begin;
create temp table gallery_ids(name text primary key, id uuid default gen_random_uuid());
insert into gallery_ids(name) values ('edition'), ('batch23'), ('batch24'), ('student'), ('other'), ('pending'), ('admin'), ('coordinator');
grant select on gallery_ids to anon, authenticated, service_role;
create function pg_temp.gid(name text) returns uuid language sql as $$ select id from gallery_ids where gallery_ids.name = $1 $$;
create function pg_temp.gallery_claim(name text) returns text language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', pg_temp.gid($1), 'role', 'authenticated')::text, true);
$$;
create function pg_temp.gallery_key(name text) returns text language sql as $$
  select 'gallery/' || pg_temp.gid($1) || '/' || pg_temp.gid($1) || '.webp';
$$;
insert into public.editions(id, name, starts_on, status, registration_opens_at, registration_closes_at)
values (pg_temp.gid('edition'), 'SPANDAN 4.0', '2026-12-03', 'draft', '2026-11-20T11:31Z', '2026-11-28T18:29Z');

-- Catalogue seed goes here.

do $$ begin
  if (select count(*) from public.events where edition_id = pg_temp.gid('edition')) <> 10 then
    raise exception 'Catalogue migration must insert ten events exactly once';
  end if;
  if (select count(*) from public.events where edition_id = pg_temp.gid('edition')
    and category = 'sport' and eligibility->>'sub_category' = 'athletics'
    and operating_method = 'programme' and format = 'group' and group_min_size = 1 and group_max_size = 4
    and starts_at = '2026-12-03T11:00+05:30' and ends_at = '2026-12-05T17:00+05:30') <> 9 then
    raise exception 'Athletics category, time or format mismatch';
  end if;
  if not exists (select 1 from public.events where edition_id = pg_temp.gid('edition') and slug = 'free-fire'
    and category = 'other' and batch_restricted and group_min_size = 4 and group_max_size = 4
    and starts_at = '2026-12-04T22:00+05:30' and ends_at = '2026-12-06T23:30+05:30'
    and application_closes_at = '2026-11-28T18:29Z' and state = 'open' and operating_method = 'results_only') then
    raise exception 'Free Fire time or format mismatch';
  end if;
end $$;

insert into public.batches(id, edition_id, label, course_label) values
  (pg_temp.gid('batch23'), pg_temp.gid('edition'), 'MBBS 2023', 'MBBS'),
  (pg_temp.gid('batch24'), pg_temp.gid('edition'), '2024', 'MBBS');
insert into auth.users(id, email)
select id, name || '@isolated.invalid' from gallery_ids where name in ('student', 'other', 'pending', 'admin', 'coordinator');
insert into public.profiles(id, full_name, batch_id, roll_canonical, phone_e164, fest_id, gender)
select id, name, pg_temp.gid(case when name = 'other' then 'batch24' else 'batch23' end),
  row_number() over(order by name)::text, '+91980000010' || row_number() over(order by name),
  'SPD-' || upper(substr(replace(id::text, '-', ''), 1, 12)), 'male'
from gallery_ids where name in ('student', 'other', 'pending', 'admin', 'coordinator');
insert into public.access_records(edition_id, profile_id, state, verified_at)
select pg_temp.gid('edition'), id, 'active', now() from gallery_ids where name in ('student', 'other', 'admin', 'coordinator');
insert into public.access_records(edition_id, profile_id, state)
values (pg_temp.gid('edition'), pg_temp.gid('pending'), 'pending');
insert into public.staff_assignments(profile_id, role) values (pg_temp.gid('admin'), 'main_admin');
insert into public.staff_assignments(profile_id, role, event_id)
select pg_temp.gid('coordinator'), 'event_coordinator', id from public.events where slug = '100m-sprint' and edition_id = pg_temp.gid('edition');

set local role authenticated;
do $$ begin
  perform pg_temp.gallery_claim('student');
  if not public.can_publish_student_gallery_post() then raise exception '2023 student denied'; end if;
  if has_function_privilege(current_user, 'public.publish_student_gallery_post(uuid,text,text)', 'execute') then
    raise exception 'Client can bypass upload endpoint';
  end if;
  perform pg_temp.gallery_claim('other');
  if public.can_publish_student_gallery_post() then raise exception 'Other batch allowed'; end if;
  perform pg_temp.gallery_claim('pending');
  if public.can_publish_student_gallery_post() then raise exception 'Pending account allowed'; end if;
end $$;
reset role;
set local role service_role;
do $$ begin
  begin
    perform public.publish_student_gallery_post(pg_temp.gid('other'), 'Denied', pg_temp.gallery_key('other'));
    raise exception 'Service write bypassed batch eligibility';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.publish_student_gallery_post(pg_temp.gid('student'), '   ', pg_temp.gallery_key('student'));
    raise exception 'Empty caption accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.publish_student_gallery_post(pg_temp.gid('student'), ' Campus photo ', pg_temp.gallery_key('student'));
end $$;
reset role;
insert into public.media_assets(owner_id,purpose,provider,object_key,state,input_mime,input_size,expires_at,public_url)
values(pg_temp.gid('student'),'gallery','r2',pg_temp.gallery_key('student'),'public','image/webp',20,now(),'https://media.example.test/test.webp');

set local role anon;
do $$ begin
  if not exists (select 1 from public.get_published_gallery_posts()
    where storage_path = pg_temp.gallery_key('student') and event_title is null and event_slug is null and caption = 'Campus photo') then
    raise exception 'Published student photo missing from public Gallery';
  end if;
end $$;
reset role;
set local role authenticated;
do $$
declare post_id uuid;
begin
  select id into strict post_id from public.get_published_gallery_posts() where storage_path = pg_temp.gallery_key('student');
  perform pg_temp.gallery_claim('coordinator');
  begin
    perform public.archive_gallery_moment(post_id);
    raise exception 'Coordinator removed a student post';
  exception when insufficient_privilege then null;
  end;
  perform pg_temp.gallery_claim('admin');
  if not exists (select 1 from public.list_manageable_gallery_moments() where id = post_id) then
    raise exception 'Main Admin cannot see student post';
  end if;
  perform public.archive_gallery_moment(post_id);
  if exists (select 1 from public.get_published_gallery_posts() where id = post_id) then
    raise exception 'Archived post remains public';
  end if;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select public.delete_student_profile(pg_temp.gid('student'));
do $$ begin
  if exists (select 1 from public.gallery_moments where storage_path = pg_temp.gallery_key('student'))
    or exists (select 1 from public.media_assets where owner_id = pg_temp.gid('student'))
    or exists (select 1 from public.profiles where id = pg_temp.gid('student')) then
    raise exception 'Gallery content blocked profile removal';
  end if;
end $$;
rollback;
