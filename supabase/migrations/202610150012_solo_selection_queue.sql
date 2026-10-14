-- Solo selection stays distinct from application approval. Pair/group/sport entries must use group publishing.
create or replace function public.list_event_selection_queue(p_event_id uuid)
returns table (
  application_id uuid,
  full_name text,
  batch_label text,
  course_label text,
  roll_canonical text,
  review_state public.application_review_state,
  selection_state public.selection_state,
  submitted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select a.id, p.full_name, b.label, b.course_label, p.roll_canonical, a.review_state, a.selection_state, a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and a.review_state = 'approved' and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$$;
revoke all on function public.list_event_selection_queue(uuid) from public;
grant execute on function public.list_event_selection_queue(uuid) to authenticated;

create or replace function public.select_solo_application(p_application_id uuid, p_state public.selection_state, p_reason text default null)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare
  application public.applications;
  event_record public.events;
  prior_selection public.selection_state;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_state not in ('selected', 'reserve', 'not_selected') then raise exception 'Invalid selection state' using errcode = '22023'; end if;
  select * into application from public.applications where id = p_application_id for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  select * into event_record from public.events where id = application.event_id;
  if not public.can_manage_event(application.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if event_record.format <> 'solo' then raise exception 'Pair, group and sport selection requires a published participant group' using errcode = '22023'; end if;
  if application.review_state <> 'approved' then raise exception 'Only approved applications can be selected' using errcode = '22023'; end if;
  prior_selection := application.selection_state;
  update public.applications set selection_state = p_state where id = application.id returning * into application;
  insert into public.application_history (application_id, actor_id, from_review_state, to_review_state, from_selection_state, to_selection_state, reason)
  values (application.id, auth.uid(), application.review_state, application.review_state, prior_selection, application.selection_state, nullif(btrim(p_reason), ''));
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (auth.uid(), 'application.select_solo', 'application', application.id, nullif(btrim(p_reason), ''), jsonb_build_object('selection_state', p_state));
  return application;
end;
$$;
revoke all on function public.select_solo_application(uuid, public.selection_state, text) from public;
grant execute on function public.select_solo_application(uuid, public.selection_state, text) to authenticated;
