-- Main-admin configuration for batches and draft events. Public visibility
-- remains controlled by the existing event lifecycle, never by client state.
create or replace function public.list_admin_batches()
returns table (batch_id uuid, label text, course_label text, eligible boolean, edition_name text)
language sql stable security definer set search_path = public as $$
  select b.id, b.label, b.course_label, b.eligible, e.name
  from public.batches b join public.editions e on e.id = b.edition_id
  where public.is_main_admin()
  order by e.starts_on nulls last, b.label, b.course_label nulls first;
$$;

create or replace function public.list_admin_editions()
returns table (edition_id uuid, name text, starts_on date, ends_on date, status text)
language sql stable security definer set search_path = public as $$
  select e.id, e.name, e.starts_on, e.ends_on, e.status
  from public.editions e where public.is_main_admin()
  order by e.starts_on nulls last, e.created_at desc;
$$;

create or replace function public.create_eligible_batch(
  p_edition_id uuid,
  p_label text,
  p_course_label text default null,
  p_eligible boolean default true
)
returns public.batches language plpgsql security definer set search_path = public as $$
declare created public.batches;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.editions where id = p_edition_id) then raise exception 'Festival edition not found' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_label)), 0) not between 1 and 80 then raise exception 'Batch label is required' using errcode = '22023'; end if;
  insert into public.batches (edition_id, label, course_label, eligible)
  values (p_edition_id, btrim(p_label), nullif(btrim(p_course_label), ''), p_eligible)
  returning * into created;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'batch.created', 'batch', created.id, jsonb_build_object('edition_id', p_edition_id, 'eligible', p_eligible));
  return created;
end;
$$;

create or replace function public.create_admin_event(
  p_edition_id uuid,
  p_title text,
  p_category public.event_category,
  p_format public.event_format,
  p_score_template text,
  p_summary text default '',
  p_venue text default null,
  p_application_capacity integer default null,
  p_application_opens_at timestamptz default null,
  p_application_closes_at timestamptz default null,
  p_reporting_at timestamptz default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns public.events language plpgsql security definer set search_path = public as $$
declare created public.events; generated_slug text;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode = '42501'; end if;
  if not exists (select 1 from public.editions where id = p_edition_id) then raise exception 'Festival edition not found' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if p_score_template not in ('generic', 'cricket', 'football', 'badminton') then raise exception 'Invalid score template' using errcode = '22023'; end if;
  generated_slug := trim(both '-' from regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then raise exception 'Event title needs letters or numbers' using errcode = '22023'; end if;
  insert into public.events (edition_id, title, slug, category, format, score_template, summary, venue, application_capacity, application_opens_at, application_closes_at, reporting_at, starts_at, ends_at, state)
  values (p_edition_id, btrim(p_title), generated_slug, p_category, p_format, p_score_template, btrim(p_summary), nullif(btrim(p_venue), ''), p_application_capacity, p_application_opens_at, p_application_closes_at, p_reporting_at, p_starts_at, p_ends_at, 'draft')
  returning * into created;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.created', 'event', created.id, jsonb_build_object('edition_id', p_edition_id, 'slug', created.slug, 'state', created.state));
  return created;
end;
$$;

revoke all on function public.list_admin_batches() from public, anon;
revoke all on function public.list_admin_editions() from public, anon;
revoke all on function public.create_eligible_batch(uuid, text, text, boolean) from public, anon;
revoke all on function public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) from public, anon;
grant execute on function public.list_admin_batches() to authenticated;
grant execute on function public.list_admin_editions() to authenticated;
grant execute on function public.create_eligible_batch(uuid, text, text, boolean) to authenticated;
grant execute on function public.create_admin_event(uuid, text, public.event_category, public.event_format, text, text, text, integer, timestamptz, timestamptz, timestamptz, timestamptz, timestamptz) to authenticated;
