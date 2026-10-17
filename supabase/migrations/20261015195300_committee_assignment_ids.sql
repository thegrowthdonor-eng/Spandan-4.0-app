-- Return the assignment id so a Main Admin can revoke the exact scoped role.
drop function public.list_committee_members();

create or replace function public.list_committee_members()
returns table (
  assignment_id uuid,
  profile_id uuid,
  full_name text,
  fest_id text,
  batch_label text,
  role public.staff_role,
  event_id uuid,
  event_title text,
  granted_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select s.id, p.id, p.full_name, p.fest_id, b.label, s.role, s.event_id, e.title, s.granted_at
  from public.staff_assignments s
  join public.profiles p on p.id = s.profile_id
  join public.batches b on b.id = p.batch_id
  left join public.events e on e.id = s.event_id
  where s.revoked_at is null and public.is_main_admin()
  order by p.full_name, s.role;
$$;

revoke all on function public.list_committee_members() from public, anon;
grant execute on function public.list_committee_members() to authenticated;
