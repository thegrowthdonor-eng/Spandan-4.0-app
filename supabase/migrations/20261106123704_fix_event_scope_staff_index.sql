drop index if exists public.active_global_staff_assignment;
create unique index if not exists active_global_staff_assignment
  on public.staff_assignments(profile_id, role)
  where revoked_at is null and event_id is null and event_category is null;
