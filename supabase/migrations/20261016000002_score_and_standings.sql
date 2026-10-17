-- Score templates: generic, cricket, football, badminton.
-- Point rules management and standings read.

-- Configure point rules for an event (required before publishing results)
create or replace function public.set_event_point_rules(
  p_event_id uuid,
  p_rules jsonb -- [{placing: 1, points: 10}, ...]
)
returns void language plpgsql security definer set search_path = public as $$
declare
  rule jsonb;
  placing_val integer;
  points_val integer;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Rules must be a JSON array' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  -- Delete existing rules for this event
  delete from public.point_rules where event_id = p_event_id;
  -- Insert new rules
  for rule in select value from jsonb_array_elements(p_rules) loop
    placing_val := (rule->>'placing')::integer;
    points_val  := (rule->>'points')::integer;
    if placing_val is null or placing_val < 1 then
      raise exception 'Invalid placing in point rules' using errcode = '22023';
    end if;
    if points_val is null or points_val < 0 then
      raise exception 'Points must be a non-negative integer' using errcode = '22023';
    end if;
    insert into public.point_rules(event_id, placing, points, configured_by)
    values (p_event_id, placing_val, points_val, auth.uid())
    on conflict (event_id, placing) do update set points = excluded.points, configured_by = excluded.configured_by, configured_at = now();
  end loop;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.point_rules_set', 'event', p_event_id,
    jsonb_build_object('rule_count', jsonb_array_length(p_rules)));
end;
$$;
revoke all on function public.set_event_point_rules(uuid, jsonb) from public, anon;
grant execute on function public.set_event_point_rules(uuid, jsonb) to authenticated;

-- List point rules for an event (admin-only)
create or replace function public.list_event_point_rules(p_event_id uuid)
returns table ("placing" integer, points integer)
language sql stable security definer set search_path = public as $$
  select "placing", points from public.point_rules
  where event_id = p_event_id
    and (public.is_main_admin() or public.can_manage_event(p_event_id))
  order by "placing";
$$;
revoke all on function public.list_event_point_rules(uuid) from public, anon;
grant execute on function public.list_event_point_rules(uuid) to authenticated;

-- Get latest score snapshot for a fixture (for expected-version check on client)
create or replace function public.get_fixture_score(p_fixture_id uuid)
returns table (version integer, score_payload jsonb, status text, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  fixture_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select event_id into fixture_event_id from public.fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select ss.version, ss.score_payload, ss.status, ss.updated_at
    from public.score_snapshots ss
    where ss.fixture_id = p_fixture_id
    order by ss.version desc
    limit 1;
end;
$$;
revoke all on function public.get_fixture_score(uuid) from public, anon;
grant execute on function public.get_fixture_score(uuid) to authenticated;

-- List result publications for an event (including corrections history)
create or replace function public.list_event_results(p_event_id uuid)
returns table (
  publication_id uuid, version integer, state text, reason text,
  published_by_name text, published_at timestamptz,
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
    group by rp.id, rp.version, rp.state, rp.reason, p.full_name, rp.published_at
    order by rp.version desc;
end;
$$;
revoke all on function public.list_event_results(uuid) from public, anon;
grant execute on function public.list_event_results(uuid) to authenticated;

-- Batch standings board (public read, from existing view)
-- Extend public standings to include batch labels for display
create or replace function public.get_batch_standings()
returns table (batch_id uuid, batch_label text, course_label text, edition_name text, points integer)
language sql stable security definer set search_path = public as $$
  select
    bs.batch_id,
    b.label,
    b.course_label,
    e.name,
    bs.points
  from public.published_batch_standings bs
  join public.batches b on b.id = bs.batch_id
  join public.editions e on e.id = b.edition_id
  order by bs.points desc, b.label;
$$;
-- This is intentionally public (no auth required for standings display)
grant execute on function public.get_batch_standings() to anon, authenticated;
