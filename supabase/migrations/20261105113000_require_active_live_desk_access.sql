-- Keep live-desk access aligned with every other organiser permission: a
-- suspended profile must lose access immediately, including existing sessions.
create or replace function public.can_manage_live_desk()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_active_festival_access()
    and exists (
      select 1
      from public.staff_assignments
      where profile_id = auth.uid()
        and revoked_at is null
        and role in ('main_admin', 'event_coordinator')
    );
$$;

revoke all on function public.can_manage_live_desk() from public, anon;
grant execute on function public.can_manage_live_desk() to authenticated;

notify pgrst, 'reload schema';
