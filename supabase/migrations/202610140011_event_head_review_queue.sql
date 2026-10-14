-- Event-scoped staff projections. Every query repeats the assignment check in database code.
create or replace function public.list_managed_events()
returns table (id uuid, title text, category public.event_category, format public.event_format, state public.event_state)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.category, e.format, e.state
  from public.events e
  where public.can_manage_event(e.id)
  order by e.title;
$$;
revoke all on function public.list_managed_events() from public;
grant execute on function public.list_managed_events() to authenticated;

create or replace function public.list_event_review_queue(p_event_id uuid)
returns table (
  application_id uuid,
  student_id uuid,
  full_name text,
  batch_label text,
  course_label text,
  roll_canonical text,
  review_state public.application_review_state,
  selection_state public.selection_state,
  submitted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, a.student_id, p.full_name, b.label, b.course_label, p.roll_canonical, a.review_state, a.selection_state, a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$$;
revoke all on function public.list_event_review_queue(uuid) from public;
grant execute on function public.list_event_review_queue(uuid) to authenticated;
