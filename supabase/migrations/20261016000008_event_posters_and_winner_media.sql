-- Migration 20261016000008: Event Posters and Winner/Podium Media Showcase
-- Adds poster_url to events and podium_photo_url + podium_caption to result_publications.
-- Updates RPCs: list_admin_event_editor_data, update_admin_event_full, publish_result_positions, list_event_results.
-- Exposes get_published_event_results() for public standings & event showcase.

-- 1. Add columns to public.events
alter table public.events
  add column if not exists poster_url text;

-- 2. Add columns to public.result_publications
alter table public.result_publications
  add column if not exists podium_photo_url text,
  add column if not exists podium_caption text;

-- 3. Update list_admin_event_editor_data to include poster_url
drop function if exists public.list_admin_event_editor_data();

create or replace function public.list_admin_event_editor_data()
returns table (
  event_id uuid, title text, category public.event_category,
  format public.event_format, score_template text, state public.event_state,
  summary text, rules_markdown text, venue text,
  application_capacity integer, waitlist_enabled boolean,
  application_opens_at timestamptz, application_closes_at timestamptz,
  roster_lock_at timestamptz, reporting_at timestamptz,
  starts_at timestamptz, ends_at timestamptz,
  eligibility jsonb, application_questions jsonb,
  group_min_size integer, group_max_size integer, batch_restricted boolean,
  poster_url text
)
language sql stable security definer set search_path = public as $$
  select
    id, title, category, format, score_template, state,
    summary, rules_markdown, venue,
    application_capacity, waitlist_enabled,
    application_opens_at, application_closes_at,
    roster_lock_at, reporting_at, starts_at, ends_at,
    eligibility, application_questions,
    group_min_size, group_max_size, batch_restricted,
    poster_url
  from public.events
  where public.is_main_admin()
  order by title;
$$;
revoke all on function public.list_admin_event_editor_data() from public, anon;
grant execute on function public.list_admin_event_editor_data() to authenticated;

-- 4. Update update_admin_event_full to accept and save poster_url
drop function if exists public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean);
drop function if exists public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text);

create or replace function public.update_admin_event_full(
  p_event_id uuid,
  p_title text,
  p_summary text,
  p_rules_markdown text,
  p_venue text,
  p_application_capacity integer,
  p_waitlist_enabled boolean,
  p_application_opens_at timestamptz,
  p_application_closes_at timestamptz,
  p_roster_lock_at timestamptz,
  p_reporting_at timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_eligibility jsonb,
  p_application_questions jsonb,
  p_group_min_size integer,
  p_group_max_size integer,
  p_batch_restricted boolean,
  p_poster_url text default null
)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  updated public.events;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'Event title is required' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_summary)), 0) > 600 then
    raise exception 'Summary must be at most 600 characters' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_rules_markdown)), 0) > 20000 then
    raise exception 'Rules content is too long' using errcode = '22023';
  end if;
  if p_application_closes_at is not null and p_application_opens_at is not null
     and p_application_closes_at <= p_application_opens_at then
    raise exception 'Registration closing time must be after opening time' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then
    raise exception 'Event end time must be after start time' using errcode = '22023';
  end if;
  if p_group_min_size is not null and p_group_max_size is not null
     and p_group_max_size < p_group_min_size then
    raise exception 'Group max size must be at least min size' using errcode = '22023';
  end if;
  if p_application_questions is not null and jsonb_typeof(p_application_questions) <> 'array' then
    raise exception 'Application questions must be a JSON array' using errcode = '22023';
  end if;
  if p_eligibility is not null and jsonb_typeof(p_eligibility) <> 'object' then
    raise exception 'Eligibility must be a JSON object' using errcode = '22023';
  end if;

  update public.events set
    title                 = btrim(p_title),
    summary               = btrim(p_summary),
    rules_markdown        = btrim(p_rules_markdown),
    venue                 = nullif(btrim(p_venue), ''),
    application_capacity  = p_application_capacity,
    waitlist_enabled      = coalesce(p_waitlist_enabled, false),
    application_opens_at  = p_application_opens_at,
    application_closes_at = p_application_closes_at,
    roster_lock_at        = p_roster_lock_at,
    reporting_at          = p_reporting_at,
    starts_at             = p_starts_at,
    ends_at               = p_ends_at,
    eligibility           = coalesce(p_eligibility, '{}'::jsonb),
    application_questions = coalesce(p_application_questions, '[]'::jsonb),
    group_min_size        = p_group_min_size,
    group_max_size        = p_group_max_size,
    batch_restricted      = coalesce(p_batch_restricted, false),
    poster_url            = nullif(btrim(p_poster_url), '')
  where id = p_event_id
  returning * into updated;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.full_updated', 'event', updated.id,
    jsonb_build_object('title', updated.title, 'state', updated.state, 'poster_url', updated.poster_url));
  return updated;
end;
$$;
revoke all on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) from public, anon;
grant execute on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) to authenticated;

-- 5. Update publish_result_positions to accept podium_photo_url & podium_caption
drop function if exists public.publish_result_positions(uuid, jsonb, text);
drop function if exists public.publish_result_positions(uuid, jsonb, text, text, text);

create or replace function public.publish_result_positions(
  p_event_id uuid,
  p_positions jsonb,
  p_reason text default null,
  p_podium_photo_url text default null,
  p_podium_caption text default null
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
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception 'At least one final position is required' using errcode = '22023';
  end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;

  select * into prior_publication from public.result_publications where event_id = p_event_id and state = 'published' for update;
  had_prior := found;
  if had_prior and coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'A correction reason is required' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from public.result_publications where event_id = p_event_id;

  insert into public.result_publications (
    event_id, version, state, reason, published_by, published_at,
    podium_photo_url, podium_caption
  )
  values (
    p_event_id, next_version, 'published', nullif(btrim(p_reason), ''), auth.uid(), now(),
    nullif(btrim(p_podium_photo_url), ''), nullif(btrim(p_podium_caption), '')
  ) returning * into publication;

  for position in select value from jsonb_array_elements(p_positions) loop
    target_place := (position ->> 'placing')::integer;
    target_batch := (position ->> 'batch_id')::uuid;
    if target_place is null or target_place < 1 or target_batch is null then
      raise exception 'Invalid final position' using errcode = '22023';
    end if;
    if not exists (select 1 from public.batches where id = target_batch and edition_id = locked_event.edition_id) then
      raise exception 'Result batch is not eligible for this edition' using errcode = '22023';
    end if;
    select points into configured_points from public.point_rules where event_id = p_event_id and "placing" = target_place;
    if not found then
      raise exception 'Points are not configured for placing %', target_place using errcode = '22023';
    end if;

    insert into public.result_positions (publication_id, "placing", batch_id, note)
    values (publication.id, target_place, target_batch, nullif(position ->> 'note', ''));

    insert into public.points_ledger (publication_id, batch_id, points)
    values (publication.id, target_batch, configured_points);
  end loop;

  if had_prior then
    update public.result_publications set state = 'superseded', superseded_at = now() where id = prior_publication.id;
  end if;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'results.published', 'result_publication', publication.id,
    jsonb_build_object('event_id', p_event_id, 'version', publication.version, 'has_podium_photo', publication.podium_photo_url is not null));

  return publication;
end;
$$;
revoke all on function public.publish_result_positions(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.publish_result_positions(uuid, jsonb, text, text, text) to authenticated;

-- 6. Update list_event_results to return podium_photo_url & podium_caption
drop function if exists public.list_event_results(uuid);

create or replace function public.list_event_results(p_event_id uuid)
returns table (
  publication_id uuid, version integer, state text, reason text,
  published_by_name text, published_at timestamptz,
  podium_photo_url text, podium_caption text,
  positions jsonb -- [{placing, batch_id, batch_label, points, note}]
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select
      rp.id,
      rp.version,
      rp.state::text,
      rp.reason,
      p.full_name,
      rp.published_at,
      rp.podium_photo_url,
      rp.podium_caption,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'placing', pos.placing,
            'batch_id', pos.batch_id,
            'batch_label', b.label,
            'points', pr.points,
            'note', pos.note
          ) order by pos.placing
        ) filter (where pos.id is not null),
        '[]'::jsonb
      )
    from public.result_publications rp
    left join public.profiles p on p.id = rp.published_by
    left join public.result_positions pos on pos.publication_id = rp.id
    left join public.batches b on b.id = pos.batch_id
    left join public.point_rules pr on pr.event_id = p_event_id and pr.placing = pos.placing
    where rp.event_id = p_event_id
    group by rp.id, rp.version, rp.state, rp.reason, p.full_name, rp.published_at, rp.podium_photo_url, rp.podium_caption
    order by rp.version desc;
end;
$$;
revoke all on function public.list_event_results(uuid) from public, anon;
grant execute on function public.list_event_results(uuid) to authenticated;

-- 7. Public RPC to list published event results with winner podium media
drop function if exists public.get_published_event_results();

create or replace function public.get_published_event_results()
returns table (
  event_id uuid,
  event_title text,
  event_slug text,
  category public.event_category,
  format public.event_format,
  poster_url text,
  publication_id uuid,
  published_at timestamptz,
  podium_photo_url text,
  podium_caption text,
  positions jsonb
)
language sql stable security definer set search_path = public as $$
  select
    e.id as event_id,
    e.title as event_title,
    e.slug as event_slug,
    e.category,
    e.format,
    e.poster_url,
    rp.id as publication_id,
    rp.published_at,
    rp.podium_photo_url,
    rp.podium_caption,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'placing', pos.placing,
          'batch_id', pos.batch_id,
          'batch_label', b.label,
          'course_label', b.course_label,
          'points', coalesce(pl.points, 0),
          'note', pos.note
        ) order by pos.placing
      ) filter (where pos.id is not null),
      '[]'::jsonb
    ) as positions
  from public.result_publications rp
  join public.events e on e.id = rp.event_id
  left join public.result_positions pos on pos.publication_id = rp.id
  left join public.batches b on b.id = pos.batch_id
  left join public.points_ledger pl on pl.publication_id = rp.id and pl.batch_id = pos.batch_id
  where rp.state = 'published'
  group by e.id, e.title, e.slug, e.category, e.format, e.poster_url, rp.id, rp.published_at, rp.podium_photo_url, rp.podium_caption
  order by rp.published_at desc;
$$;
grant execute on function public.get_published_event_results() to anon, authenticated;
