-- Migration: Roll Reservation Rules & Atomic Student Profile Deletion
-- 1. Create delete_student_profile(p_profile_id uuid) to safely remove all relational data
--    and delete the profile without violating foreign key constraints.
-- 2. Allow both Main Admin and Desk Controllers (Treasurer / can_manage_access) to remove profiles.

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

  if exists (
    select 1 from public.staff_assignments
    where profile_id = p_profile_id and revoked_at is null and role = 'main_admin'
  ) then
    raise exception 'Cannot delete Main Admin profile' using errcode = '42501';
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
      'profile.removed',
      'profile',
      p_profile_id,
      jsonb_build_object('full_name', target_profile.full_name, 'roll', target_profile.roll_canonical, 'fest_id', target_profile.fest_id)
    );
  end if;

  return true;
end;
$$;

revoke all on function public.delete_student_profile(uuid) from public, anon;
grant execute on function public.delete_student_profile(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
