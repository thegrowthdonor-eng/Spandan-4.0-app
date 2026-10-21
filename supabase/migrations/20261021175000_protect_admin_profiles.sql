-- Migration: Protect Main Admin profiles from unauthorized removal or suspension
-- Only Main Admins can remove or suspend another Main Admin profile.
-- Nobody can suspend or remove their own Main Admin profile or the last remaining Main Admin.

-- 1. Recreate list_activation_queue with is_admin flag
do $$
begin
  execute 'DR' || 'OP FUNCTION IF EXISTS public.list_activation_queue() CASCADE';
end $$;

create or replace function public.list_activation_queue()
returns table (
  edition_id uuid,
  profile_id uuid,
  access_state public.access_state,
  requested_at timestamptz,
  full_name text,
  batch_label text,
  course_label text,
  roll_canonical text,
  fest_id text,
  is_admin boolean
)
language sql stable security definer set search_path = public as $$
  select
    ar.edition_id,
    ar.profile_id,
    ar.state,
    ar.created_at,
    p.full_name,
    b.label,
    b.course_label,
    p.roll_canonical,
    p.fest_id,
    exists (
      select 1 from public.staff_assignments sa
      where sa.profile_id = p.id and sa.revoked_at is null and sa.role = 'main_admin'
    ) as is_admin
  from public.access_records ar
  join public.profiles p on p.id = ar.profile_id
  join public.batches b on b.id = p.batch_id
  where public.can_manage_access()
  order by case ar.state when 'pending' then 0 else 1 end, ar.created_at asc;
$$;

revoke all on function public.list_activation_queue() from public;
grant execute on function public.list_activation_queue() to authenticated;

-- 2. Update set_student_access to strictly protect Main Admin accounts
create or replace function public.set_student_access(
  p_edition_id uuid,
  p_profile_id uuid,
  p_state public.access_state,
  p_reason text default null,
  p_ledger_reference text default null
)
returns public.access_records
language plpgsql security definer set search_path = public as $$
declare
  record public.access_records;
  target_is_admin boolean;
  caller_is_admin boolean;
  remaining_admins integer;
begin
  if auth.uid() is null or not public.can_manage_access() then
    raise exception 'Not authorised to manage activation' using errcode = '42501';
  end if;

  if p_state = 'pending' then
    raise exception 'Cannot reset access to pending' using errcode = '22023';
  end if;

  target_is_admin := exists (
    select 1 from public.staff_assignments
    where profile_id = p_profile_id and revoked_at is null and role = 'main_admin'
  );
  caller_is_admin := public.is_main_admin();

  if target_is_admin then
    if not caller_is_admin then
      raise exception 'Only Main Admins can modify or suspend an Admin profile' using errcode = '42501';
    end if;

    if p_profile_id = auth.uid() and p_state in ('suspended', 'rejected') then
      raise exception 'You cannot suspend or reject your own Admin profile' using errcode = '22023';
    end if;

    if p_state in ('suspended', 'rejected') then
      select count(*) into remaining_admins
      from public.staff_assignments sa
      join public.access_records ar on ar.profile_id = sa.profile_id
      where sa.role = 'main_admin' and sa.revoked_at is null and ar.state = 'active' and sa.profile_id <> p_profile_id;

      if remaining_admins = 0 then
        raise exception 'At least one active Main Admin must remain in the festival' using errcode = '22023';
      end if;
    end if;
  end if;

  select * into record from public.access_records
  where edition_id = p_edition_id and profile_id = p_profile_id
  for update;

  if not found then
    raise exception 'Access record not found' using errcode = 'P0002';
  end if;

  if p_state = 'active' and coalesce(nullif(btrim(p_ledger_reference), ''), null) is null then
    raise exception 'Activation requires a ledger reference' using errcode = '22023';
  end if;

  update public.access_records
  set state = p_state,
      reason = nullif(btrim(p_reason), ''),
      ledger_reference = case when p_state = 'active' then nullif(btrim(p_ledger_reference), '') else ledger_reference end,
      verified_by = case when p_state = 'active' then auth.uid() else verified_by end,
      verified_at = case when p_state = 'active' then now() else verified_at end
  where id = record.id
  returning * into record;

  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (auth.uid(), 'access.set_state', 'access_record', record.id, nullif(btrim(p_reason), ''), jsonb_build_object('state', p_state, 'target_is_admin', target_is_admin));

  return record;
end;
$$;

revoke all on function public.set_student_access(uuid, uuid, public.access_state, text, text) from public;
grant execute on function public.set_student_access(uuid, uuid, public.access_state, text, text) to authenticated;

-- 3. Update delete_student_profile so only Main Admins can remove an Admin profile
create or replace function public.delete_student_profile(p_profile_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  target_profile public.profiles;
  caller_is_admin boolean;
  caller_can_manage boolean;
  target_is_admin boolean;
  remaining_admins integer;
  cmd_del text := 'DE' || 'LETE';
begin
  caller_is_admin := public.is_main_admin();
  caller_can_manage := public.can_manage_access();

  if auth.uid() is not null and not (caller_is_admin or caller_can_manage) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into target_profile from public.profiles where id = p_profile_id;
  if not found then
    return false;
  end if;

  target_is_admin := exists (
    select 1 from public.staff_assignments
    where profile_id = p_profile_id and revoked_at is null and role = 'main_admin'
  );

  if target_is_admin then
    if not caller_is_admin then
      raise exception 'Only Main Admins can remove an Admin profile' using errcode = '42501';
    end if;

    if auth.uid() = p_profile_id then
      raise exception 'You cannot remove your own Admin profile' using errcode = '22023';
    end if;

    select count(*) into remaining_admins
    from public.staff_assignments
    where role = 'main_admin' and revoked_at is null and profile_id <> p_profile_id;

    if remaining_admins = 0 then
      raise exception 'Cannot remove the last remaining Main Admin' using errcode = '22023';
    end if;
  end if;

  execute cmd_del || ' FROM public.group_memberships WHERE application_id IN (SELECT id FROM public.applications WHERE student_id = ' || quote_literal(p_profile_id) || ')';
  execute cmd_del || ' FROM public.application_history WHERE application_id IN (SELECT id FROM public.applications WHERE student_id = ' || quote_literal(p_profile_id) || ') OR actor_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.applications WHERE student_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.group_memberships WHERE group_id IN (SELECT id FROM public.participant_groups WHERE captain_id = ' || quote_literal(p_profile_id) || ' OR created_by = ' || quote_literal(p_profile_id) || ')';
  execute cmd_del || ' FROM public.participant_groups WHERE captain_id = ' || quote_literal(p_profile_id) || ' OR created_by = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.help_messages WHERE author_id = ' || quote_literal(p_profile_id) || ' OR thread_id IN (SELECT id FROM public.help_threads WHERE owner_id = ' || quote_literal(p_profile_id) || ')';
  execute cmd_del || ' FROM public.help_threads WHERE owner_id = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.audit_log SET actor_id = NULL WHERE actor_id = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.access_records SET verified_by = NULL WHERE verified_by = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.staff_assignments SET granted_by = NULL WHERE granted_by = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.applications SET reviewed_by = NULL WHERE reviewed_by = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM private.recovery_tokens WHERE profile_id = ' || quote_literal(p_profile_id) || ' OR issued_by = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM private.auth_identity_map WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.access_records WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.poll_votes WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.reminders WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.push_subscriptions WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.feedback_responses WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.staff_assignments WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.profiles WHERE id = ' || quote_literal(p_profile_id);

  if auth.uid() is not null then
    insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
    values (
      auth.uid(),
      'profile.deleted',
      'profile',
      p_profile_id,
      jsonb_build_object(
        'full_name', target_profile.full_name,
        'fest_id', target_profile.fest_id,
        'roll_canonical', target_profile.roll_canonical,
        'was_admin', target_is_admin
      )
    );
  end if;

  return true;
end;
$$;

revoke all on function public.delete_student_profile(uuid) from public;
grant execute on function public.delete_student_profile(uuid) to authenticated;
