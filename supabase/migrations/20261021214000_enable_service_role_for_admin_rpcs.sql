-- Enable service_role / superuser execution for admin permission checks
-- Regular users continue to be strictly verified against staff_assignments

create or replace function public.is_main_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (select 1 from public.staff_assignments where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null)
  );
$$;

create or replace function public.can_manage_access()
returns boolean language sql stable security definer set search_path = public as $$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (select 1 from public.staff_assignments where profile_id = auth.uid() and revoked_at is null and role in ('main_admin', 'treasurer'))
  );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (
      select 1 from public.staff_assignments
      where profile_id = auth.uid() and revoked_at is null
        and (role = 'main_admin' or (role = 'event_head' and event_id = p_event_id))
    )
  );
$$;

create or replace function public.can_publish_notices()
returns boolean language sql stable security definer set search_path = public as $$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (
      select 1 from public.staff_assignments
      where profile_id = auth.uid()
        and role in ('main_admin', 'notice_publisher')
        and revoked_at is null
    )
  );
$$;

revoke all on function public.is_main_admin() from public;
grant execute on function public.is_main_admin() to authenticated, service_role;

revoke all on function public.can_manage_access() from public;
grant execute on function public.can_manage_access() to authenticated, service_role;

revoke all on function public.can_manage_event(uuid) from public;
grant execute on function public.can_manage_event(uuid) to authenticated, service_role;

revoke all on function public.can_publish_notices() from public, anon;
grant execute on function public.can_publish_notices() to authenticated, service_role;
