-- Migration: Make ledger_reference optional in set_student_access
-- Allows instant 1-tap digital verification of student registrations without requiring physical ledger book numbers.

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

  -- Ledger reference is now strictly optional for digital verification
  update public.access_records
  set state = p_state,
      reason = nullif(btrim(p_reason), ''),
      ledger_reference = case 
        when p_state = 'active' then coalesce(nullif(btrim(p_ledger_reference), ''), 'DIGITAL_VERIFIED') 
        else ledger_reference 
      end,
      verified_by = case when p_state = 'active' then auth.uid() else verified_by end,
      verified_at = case when p_state = 'active' then now() else verified_at end
  where id = record.id
  returning * into record;

  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (
    auth.uid(), 
    'access.set_state', 
    'access_record', 
    record.id, 
    nullif(btrim(p_reason), ''), 
    jsonb_build_object('state', p_state, 'target_is_admin', target_is_admin)
  );

  return record;
end;
$$;

revoke all on function public.set_student_access(uuid, uuid, public.access_state, text, text) from public;
grant execute on function public.set_student_access(uuid, uuid, public.access_state, text, text) to authenticated;
notify pgrst, 'reload schema';
