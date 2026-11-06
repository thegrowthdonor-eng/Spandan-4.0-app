drop function if exists public.list_result_participants(uuid);

create function public.list_result_participants(p_event_id uuid)
returns table(
  target_id uuid,
  target_kind text,
  label text,
  category text,
  batch_id uuid,
  roll_canonical text,
  batch_label text
)
language sql
stable
security definer
set search_path = public
as $$
  select candidate.target_id, candidate.target_kind, candidate.label, candidate.category,
    candidate.batch_id, candidate.roll_canonical, candidate.batch_label
  from (
    select
      application.id as target_id,
      'application'::text as target_kind,
      profile.full_name as label,
      profile.participant_category as category,
      profile.batch_id,
      profile.roll_canonical,
      batch.label as batch_label
    from public.applications application
    join public.profiles profile on profile.id = application.student_id
    join public.events event on event.id = application.event_id
    left join public.batches batch on batch.id = profile.batch_id
    where application.event_id = p_event_id
      and event.format = 'solo'
      and application.review_state = 'approved'
      and application.selection_state = 'selected'
      and auth.uid() is not null
      and public.can_manage_event(p_event_id)

    union all

    select
      participant_group.id,
      'group'::text,
      participant_group.name,
      'group'::text,
      participant_group.batch_id,
      null::text,
      batch.label
    from public.participant_groups participant_group
    join public.events event on event.id = participant_group.event_id
    left join public.batches batch on batch.id = participant_group.batch_id
    where participant_group.event_id = p_event_id
      and event.format <> 'solo'
      and participant_group.state = 'published'
      and auth.uid() is not null
      and public.can_manage_event(p_event_id)
  ) candidate
  order by candidate.target_kind, candidate.label;
$$;

create or replace function public.set_event_point_rules(
  p_event_id uuid,
  p_rules jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rule jsonb;
  placing_val integer;
  points_val integer;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  perform 1 from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.result_publications where event_id = p_event_id) then
    raise exception 'Point rules are locked after the first official result' using errcode = '55000';
  end if;

  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) = 0 then
    raise exception 'Rules must be a non-empty JSON array' using errcode = '22023';
  end if;

  delete from public.point_rules where event_id = p_event_id;
  for rule in select value from jsonb_array_elements(p_rules) loop
    placing_val := (rule ->> 'placing')::integer;
    points_val := (rule ->> 'points')::integer;
    if placing_val is null or placing_val < 1 then
      raise exception 'Invalid placing in point rules' using errcode = '22023';
    end if;
    if points_val is null or points_val < 0 then
      raise exception 'Points must be a non-negative integer' using errcode = '22023';
    end if;
    insert into public.point_rules(event_id, "placing", points, configured_by)
    values (p_event_id, placing_val, points_val, auth.uid());
  end loop;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (
    auth.uid(),
    'event.point_rules_set',
    'event',
    p_event_id,
    jsonb_build_object('rule_count', jsonb_array_length(p_rules))
  );
end;
$$;

revoke all on function public.list_result_participants(uuid) from public, anon;
revoke all on function public.set_event_point_rules(uuid, jsonb) from public, anon;
grant execute on function public.list_result_participants(uuid) to authenticated, service_role;
grant execute on function public.set_event_point_rules(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
