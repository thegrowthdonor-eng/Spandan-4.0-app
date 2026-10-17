-- Admin operational views: activation search, access/role history,
-- help thread routing, reminder generation, and solo selection queue.

-- Searchable activation queue with full profile details
create or replace function public.search_activation_queue(
  p_edition_id uuid,
  p_query text default null,
  p_state text default null -- 'pending','active','rejected','suspended'
)
returns table (
  profile_id uuid, fest_id text, full_name text,
  batch_label text, course_label text, roll_canonical text, phone text,
  access_state text, reason text, ledger_reference text,
  registered_at timestamptz, verified_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.can_manage_access() then
    raise exception 'Not authorised to search activation queue' using errcode = '42501';
  end if;
  return query
    select
      p.id,
      p.fest_id,
      p.full_name,
      b.label,
      b.course_label,
      p.roll_canonical,
      p.phone_e164 as phone,
      ar.state::text,
      ar.reason,
      ar.ledger_reference,
      ar.created_at,
      ar.verified_at
    from public.access_records ar
    join public.profiles p on p.id = ar.profile_id
    left join public.batches b on b.id = p.batch_id
    where ar.edition_id = p_edition_id
      and (p_state is null or ar.state::text = p_state)
      and (
        p_query is null or p_query = '' or
        p.full_name ilike '%' || p_query || '%' or
        p.fest_id ilike '%' || p_query || '%' or
        p.roll_canonical ilike '%' || p_query || '%'
      )
    order by
      case ar.state when 'pending' then 0 when 'rejected' then 1 when 'suspended' then 2 else 3 end,
      ar.created_at desc;
end;
$$;
revoke all on function public.search_activation_queue(uuid,text,text) from public, anon;
grant execute on function public.search_activation_queue(uuid,text,text) to authenticated;

-- Audited access/role history for a profile (main admin only)
create or replace function public.get_profile_history(p_profile_id uuid)
returns table (
  log_id uuid, actor_name text, action text,
  object_type text, reason text, change_summary jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return query
    select
      al.id,
      p.full_name,
      al.action,
      al.object_type,
      al.reason,
      al.change_summary,
      al.created_at
    from public.audit_log al
    left join public.profiles p on p.id = al.actor_id
    where al.object_id = p_profile_id
       or al.actor_id = p_profile_id
    order by al.created_at desc
    limit 200;
end;
$$;
revoke all on function public.get_profile_history(uuid) from public, anon;
grant execute on function public.get_profile_history(uuid) to authenticated;

-- List help threads for staff routing (main admin sees all, event head sees event-scoped)
create or replace function public.list_help_threads_for_staff()
returns table (
  thread_id uuid, subject text, state text,
  owner_name text, event_title text,
  assigned_to_name text, created_at timestamptz, updated_at timestamptz,
  message_count bigint
)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not (public.is_main_admin() or public.can_manage_access() or
          exists (select 1 from public.staff_assignments where profile_id = auth.uid() and revoked_at is null)) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return query
    select
      ht.id,
      ht.subject,
      ht.state::text,
      p.full_name,
      ev.title,
      ap.full_name,
      ht.created_at,
      ht.updated_at,
      count(hm.id)
    from public.help_threads ht
    join public.profiles p on p.id = ht.owner_id
    left join public.events ev on ev.id = ht.event_id
    left join public.profiles ap on ap.id = ht.assigned_to
    left join public.help_messages hm on hm.thread_id = ht.id
    group by ht.id, p.full_name, ev.title, ap.full_name
    order by
      case ht.state when 'open' then 0 when 'in_progress' then 1 else 2 end,
      ht.updated_at desc;
end;
$$;
revoke all on function public.list_help_threads_for_staff() from public, anon;
grant execute on function public.list_help_threads_for_staff() to authenticated;

-- Assign/close help thread (staff action)
create or replace function public.manage_help_thread(
  p_thread_id uuid,
  p_action text, -- 'assign_self','resolve','close'
  p_reply text default null
)
returns public.help_threads
language plpgsql security definer set search_path = public as $$
declare
  thread public.help_threads;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_action not in ('assign_self','resolve','close') then
    raise exception 'Invalid help thread action' using errcode = '22023';
  end if;
  select * into thread from public.help_threads where id = p_thread_id for update;
  if not found then raise exception 'Help thread not found' using errcode = 'P0002'; end if;
  -- Check staff access
  if not (public.is_main_admin() or public.can_manage_access() or
          (thread.event_id is not null and public.can_manage_event(thread.event_id))) then
    raise exception 'Not authorised for this help thread' using errcode = '42501';
  end if;
  -- Add reply if provided
  if p_reply is not null and btrim(p_reply) <> '' then
    insert into public.help_messages(thread_id, author_id, body)
    values (p_thread_id, auth.uid(), btrim(p_reply));
  end if;
  update public.help_threads set
    assigned_to = case p_action when 'assign_self' then auth.uid() else assigned_to end,
    state = case
      when p_action = 'resolve' then 'resolved'::public.help_thread_state
      when p_action = 'close' then 'closed'::public.help_thread_state
      when p_action = 'assign_self' and state = 'open' then 'in_progress'::public.help_thread_state
      else state
    end,
    updated_at = now()
  where id = p_thread_id
  returning * into thread;
  return thread;
end;
$$;
revoke all on function public.manage_help_thread(uuid, text, text) from public, anon;
grant execute on function public.manage_help_thread(uuid, text, text) to authenticated;

-- Generate in-app reminders for affected students after fixture reschedule
create or replace function public.generate_fixture_reminders(p_fixture_id uuid, p_body text default null)
returns integer -- number of reminders created/updated
language plpgsql security definer set search_path = public as $$
declare
  fixture public.fixtures;
  source_ver text;
  affected_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if fixture.starts_at is null then
    raise exception 'Fixture must have a start time before generating reminders' using errcode = '22023';
  end if;
  source_ver := 'fixture:' || p_fixture_id || ':v' || fixture.schedule_version;
  -- Upsert reminder for all selected participants in this event
  insert into public.reminders(profile_id, event_id, source_version, title, body, due_at)
    select
      app.student_id,
      fixture.event_id,
      source_ver,
      fixture.stage || ' — schedule update',
      coalesce(nullif(btrim(p_body),''), 'A schedule change has been made. Check the latest fixture time.'),
      coalesce(fixture.reporting_at, fixture.starts_at) - interval '1 hour'
    from public.applications app
    where app.event_id = fixture.event_id
      and app.selection_state = 'selected'
  on conflict (profile_id, source_version) do update
    set title = excluded.title, body = excluded.body, due_at = excluded.due_at,
        dismissed_at = null;
  get diagnostics affected_count = row_count;
  return affected_count;
end;
$$;
revoke all on function public.generate_fixture_reminders(uuid, text) from public, anon;
grant execute on function public.generate_fixture_reminders(uuid, text) to authenticated;

-- Solo selection: select/reserve/not-select an individual applicant
-- (already exists as migrate 012 but adding wrapper for consistency)
create or replace function public.update_solo_selection(
  p_application_id uuid,
  p_selection_state public.selection_state,
  p_reason text default null
)
returns public.applications
language plpgsql security definer set search_path = public as $$
declare
  application public.applications;
  prior_selection public.selection_state;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_selection_state not in ('selected','reserve','not_selected') then
    raise exception 'Invalid selection state' using errcode = '22023';
  end if;
  select * into application from public.applications where id = p_application_id for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(application.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if application.review_state <> 'approved' then
    raise exception 'Only approved applications can be selected' using errcode = '22023';
  end if;
  prior_selection := application.selection_state;
  update public.applications set selection_state = p_selection_state
    where id = application.id returning * into application;
  insert into public.application_history(application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason)
  values (application.id, auth.uid(), application.review_state, application.review_state,
    prior_selection, p_selection_state, nullif(btrim(p_reason),''));
  insert into public.audit_log(actor_id, action, object_type, object_id, reason)
  values (auth.uid(), 'application.selection', 'application', application.id, nullif(btrim(p_reason),''));
  return application;
end;
$$;
revoke all on function public.update_solo_selection(uuid, public.selection_state, text) from public, anon;
grant execute on function public.update_solo_selection(uuid, public.selection_state, text) to authenticated;
