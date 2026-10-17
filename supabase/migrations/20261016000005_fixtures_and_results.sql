-- Extended fixtures listing with score_payload for score templates
drop function if exists public.list_event_fixtures(uuid);

create or replace function public.list_event_fixtures(p_event_id uuid)
returns table (
  fixture_id uuid,
  stage text,
  participant_a_label text,
  participant_b_label text,
  venue text,
  reporting_at timestamptz,
  starts_at timestamptz,
  state text,
  schedule_version integer,
  score_version integer,
  score_status text,
  score_payload jsonb
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select
      f.id,
      f.stage,
      f.participant_a_label,
      f.participant_b_label,
      f.venue,
      f.reporting_at,
      f.starts_at,
      f.state::text,
      f.schedule_version,
      coalesce(ss.version, 0)::integer,
      ss.status,
      ss.score_payload
    from public.fixtures f
    left join lateral (
      select version, status, score_payload from public.score_snapshots
      where fixture_id = f.id order by version desc limit 1
    ) ss on true
    where f.event_id = p_event_id
    order by f.starts_at nulls last, f.created_at;
end;
$$;
revoke all on function public.list_event_fixtures(uuid) from public, anon;
grant execute on function public.list_event_fixtures(uuid) to authenticated;

-- Extended list_managed_events to return score_template
drop function if exists public.list_managed_events();

create or replace function public.list_managed_events()
returns table (
  id uuid,
  title text,
  category public.event_category,
  format public.event_format,
  state public.event_state,
  score_template text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.category, e.format, e.state, e.score_template
  from public.events e
  where public.can_manage_event(e.id)
  order by e.title;
$$;
revoke all on function public.list_managed_events() from public, anon;
grant execute on function public.list_managed_events() to authenticated;

-- Eligible batches for an event (accessible to Event Heads and Main Admins)
create or replace function public.list_event_eligible_batches(p_event_id uuid)
returns table (batch_id uuid, label text, course_label text)
language sql stable security definer set search_path = public as $$
  select b.id, b.label, b.course_label
  from public.batches b
  join public.events e on e.edition_id = b.edition_id
  where e.id = p_event_id
    and b.eligible = true
    and public.can_manage_event(p_event_id)
  order by b.label;
$$;
revoke all on function public.list_event_eligible_batches(uuid) from public, anon;
grant execute on function public.list_event_eligible_batches(uuid) to authenticated;
