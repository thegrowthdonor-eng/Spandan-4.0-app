-- SPANDAN 4.0: Admin policies for Merchandise and Sponsors management
-- Allows Main Admins full administrative control over promotional merchandise and sponsors.

create policy admin_merchandise_manage on public.merchandise_items
  for all to authenticated
  using (public.is_main_admin())
  with check (public.is_main_admin());

create policy admin_sponsors_manage on public.sponsors
  for all to authenticated
  using (public.is_main_admin())
  with check (public.is_main_admin());

grant all on public.merchandise_items to authenticated, service_role;
grant all on public.sponsors to authenticated, service_role;

