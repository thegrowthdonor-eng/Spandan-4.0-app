-- PRODUCTION ONLY: run after 20261104120000_council_directory.sql.
-- Seeds only confirmed faculty leadership and the eight confirmed committee names.
-- No student/member rows are invented.

begin;

do $$
declare
  target_edition constant uuid := '463de563-fc0a-41d0-8038-1e2f0558ce55';
  target_batch uuid;
  actor uuid;
begin
  if not exists (
    select 1 from public.editions
    where id = target_edition and name = 'SPANDAN 4.0'
  ) then
    raise exception 'Production guard failed: expected SPANDAN 4.0 edition was not found';
  end if;

  select b.id into target_batch
  from public.batches b
  where b.edition_id = target_edition and b.label = '2023' and b.course_label = 'MBBS';
  if target_batch is null then
    raise exception 'Production guard failed: MBBS batch 2023 was not found';
  end if;

  select sa.profile_id into actor
  from public.staff_assignments sa
  join public.access_records ar on ar.profile_id = sa.profile_id
  where sa.role = 'main_admin'
    and sa.revoked_at is null
    and ar.edition_id = target_edition
    and ar.state = 'active'
  order by sa.granted_at
  limit 1;
  if actor is null then
    raise exception 'Production guard failed: active main admin was not found';
  end if;

  insert into public.council_committees
    (edition_id, batch_id, slug, name, sort_order, state, publish_at, updated_by)
  select target_edition, target_batch, v.slug, v.name, v.sort_order, 'published', now(), actor
  from (values
    ('core', 'Core Committee', 1),
    ('finance', 'Finance Committee', 2),
    ('stage-sound', 'Stage & Sound Management', 3),
    ('decoration', 'Decoration Committee', 4),
    ('food', 'Food Committee', 5),
    ('sports', 'Sports Committee', 6),
    ('cultural', 'Cultural Committee', 7),
    ('technical-app', 'Technical & App Management', 8)
  ) as v(slug, name, sort_order)
  on conflict (edition_id, slug) do update
  set batch_id = excluded.batch_id,
      name = excluded.name,
      sort_order = excluded.sort_order,
      updated_by = excluded.updated_by;

  insert into public.council_people
    (edition_id, source_key, person_kind, display_name, leadership_role, department, sort_order, state, publish_at, updated_by)
  select target_edition, v.source_key, 'faculty', v.display_name, v.leadership_role, v.department, v.sort_order, 'published', now(), actor
  from (values
    ('faculty-principal', 'Dr. Yogesh Kumar Goyal Sir', 'Principal', null::text, 1),
    ('faculty-sports-incharge', 'Dr. Ashutosh Bhardwaj Sir', 'Sports In-charge', 'Head, Department of Physiology', 2),
    ('faculty-cultural-incharge', 'Dr. Nita Garg Ma’am', 'Cultural In-charge', 'Head, Department of Biochemistry', 3)
  ) as v(source_key, display_name, leadership_role, department, sort_order)
  on conflict (edition_id, source_key) do update
  set display_name = excluded.display_name,
      leadership_role = excluded.leadership_role,
      department = excluded.department,
      sort_order = excluded.sort_order,
      updated_by = excluded.updated_by;
end;
$$;

notify pgrst, 'reload schema';
commit;
