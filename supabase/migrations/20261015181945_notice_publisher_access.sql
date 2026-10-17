create or replace function public.can_publish_notices()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.staff_assignments
    where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null
  );
$$;

revoke all on function public.can_publish_notices() from public, anon;
grant execute on function public.can_publish_notices() to authenticated;
