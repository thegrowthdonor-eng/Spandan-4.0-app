-- Review workspace enhancements:
-- 1. Extend list_event_review_queue to return application answers and review_reason.
-- 2. Extend list_event_selection_queue to return application answers and review_reason.
-- 3. Add bulk_review_applications for atomic bulk review.
-- 4. Add bulk_solo_selection for atomic bulk solo participant selection.

-- Drop old versions first because return table signature changes
drop function if exists public.list_event_review_queue(uuid);

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
  answers jsonb,
  review_reason text,
  submitted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.student_id,
    p.full_name,
    b.label,
    b.course_label,
    p.roll_canonical,
    a.review_state,
    a.selection_state,
    a.answers,
    a.review_reason,
    a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$$;
revoke all on function public.list_event_review_queue(uuid) from public, anon;
grant execute on function public.list_event_review_queue(uuid) to authenticated;

-- Drop old selection queue function because return table signature changes
drop function if exists public.list_event_selection_queue(uuid);

create or replace function public.list_event_selection_queue(p_event_id uuid)
returns table (
  application_id uuid,
  student_id uuid,
  full_name text,
  batch_label text,
  course_label text,
  roll_canonical text,
  review_state public.application_review_state,
  selection_state public.selection_state,
  answers jsonb,
  review_reason text,
  submitted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select
    a.id,
    a.student_id,
    p.full_name,
    b.label,
    b.course_label,
    p.roll_canonical,
    a.review_state,
    a.selection_state,
    a.answers,
    a.review_reason,
    a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and a.review_state = 'approved' and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$$;
revoke all on function public.list_event_selection_queue(uuid) from public, anon;
grant execute on function public.list_event_selection_queue(uuid) to authenticated;

-- Bulk review RPC: processes multiple applications atomically with audit logging
create or replace function public.bulk_review_applications(
  p_application_ids uuid[],
  p_state public.application_review_state,
  p_reason text default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  app_id uuid;
  app_record public.applications;
  prior_state public.application_review_state;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_state not in ('approved', 'rejected', 'waitlisted') then
    raise exception 'Invalid review state' using errcode = '22023';
  end if;
  if p_state = 'rejected' and coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'Rejection reason is required' using errcode = '22023';
  end if;
  if p_application_ids is null or array_length(p_application_ids, 1) = 0 then
    return 0;
  end if;

  foreach app_id in array p_application_ids loop
    select * into app_record from public.applications where id = app_id for update;
    if found and public.can_manage_event(app_record.event_id) and app_record.review_state <> 'withdrawn' then
      prior_state := app_record.review_state;
      update public.applications set
        review_state = p_state,
        review_reason = nullif(btrim(p_reason), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
      where id = app_id;

      insert into public.application_history (
        application_id, actor_id, from_review_state, to_review_state,
        from_selection_state, to_selection_state, reason
      ) values (
        app_id, auth.uid(), prior_state, p_state,
        app_record.selection_state, app_record.selection_state, nullif(btrim(p_reason), '')
      );

      insert into public.audit_log (actor_id, action, object_type, object_id, reason)
      values (auth.uid(), 'application.bulk_review', 'application', app_id, nullif(btrim(p_reason), ''));

      processed_count := processed_count + 1;
    end if;
  end loop;

  return processed_count;
end;
$$;
revoke all on function public.bulk_review_applications(uuid[], public.application_review_state, text) from public, anon;
grant execute on function public.bulk_review_applications(uuid[], public.application_review_state, text) to authenticated;

-- Bulk solo selection RPC: selects multiple approved solo participants atomically
create or replace function public.bulk_solo_selection(
  p_application_ids uuid[],
  p_selection_state public.selection_state,
  p_reason text default null
)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  app_id uuid;
  app_record public.applications;
  event_rec public.events;
  prior_selection public.selection_state;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_selection_state not in ('selected', 'reserve', 'not_selected') then
    raise exception 'Invalid selection state' using errcode = '22023';
  end if;
  if p_application_ids is null or array_length(p_application_ids, 1) = 0 then
    return 0;
  end if;

  foreach app_id in array p_application_ids loop
    select * into app_record from public.applications where id = app_id for update;
    if found and public.can_manage_event(app_record.event_id) and app_record.review_state = 'approved' then
      select * into event_rec from public.events where id = app_record.event_id;
      if event_rec.format = 'solo' then
        prior_selection := app_record.selection_state;
        update public.applications set
          selection_state = p_selection_state
        where id = app_id;

        insert into public.application_history (
          application_id, actor_id, from_review_state, to_review_state,
          from_selection_state, to_selection_state, reason
        ) values (
          app_id, auth.uid(), app_record.review_state, app_record.review_state,
          prior_selection, p_selection_state, nullif(btrim(p_reason), '')
        );

        insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
        values (
          auth.uid(), 'application.bulk_select_solo', 'application', app_id,
          nullif(btrim(p_reason), ''), jsonb_build_object('selection_state', p_selection_state)
        );

        processed_count := processed_count + 1;
      end if;
    end if;
  end loop;

  return processed_count;
end;
$$;
revoke all on function public.bulk_solo_selection(uuid[], public.selection_state, text) from public, anon;
grant execute on function public.bulk_solo_selection(uuid[], public.selection_state, text) to authenticated;
