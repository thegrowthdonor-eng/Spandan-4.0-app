-- Event-head group/squad composer projections. Draft groups remain private to event staff.
create or replace function public.list_group_selection_candidates(p_event_id uuid)
returns table (
  event_id uuid,
  event_title text,
  event_format public.event_format,
  batch_restricted boolean,
  group_min_size integer,
  group_max_size integer,
  application_id uuid,
  student_id uuid,
  full_name text,
  batch_id uuid,
  batch_label text,
  course_label text,
  roll_canonical text
)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.format, e.batch_restricted, e.group_min_size, e.group_max_size,
    a.id, a.student_id, p.full_name, p.batch_id, b.label, b.course_label, p.roll_canonical
  from public.events e
  join public.applications a on a.event_id = e.id
  join public.profiles p on p.id = a.student_id
  join public.batches b on b.id = p.batch_id
  where e.id = p_event_id and a.review_state = 'approved' and a.selection_state = 'unselected'
    and public.can_manage_event(p_event_id)
  order by b.label, p.roll_canonical;
$$;
revoke all on function public.list_group_selection_candidates(uuid) from public;
grant execute on function public.list_group_selection_candidates(uuid) to authenticated;

create or replace function public.list_event_participant_groups(p_event_id uuid)
returns table (group_id uuid, name text, batch_id uuid, state public.group_state, member_count bigint, captain_id uuid)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, g.batch_id, g.state, count(gm.id), g.captain_id
  from public.participant_groups g
  left join public.group_memberships gm on gm.group_id = g.id and gm.removed_at is null
  where g.event_id = p_event_id and public.can_manage_event(p_event_id)
  group by g.id;
$$;
revoke all on function public.list_event_participant_groups(uuid) from public;
grant execute on function public.list_event_participant_groups(uuid) to authenticated;
