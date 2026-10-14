-- Staff-only queue projection. Student phone, private identities and recovery data never leave private tables.
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
  fest_id text
)
language sql stable security definer set search_path = public as $$
  select ar.edition_id, ar.profile_id, ar.state, ar.created_at, p.full_name, b.label, b.course_label, p.roll_canonical, p.fest_id
  from public.access_records ar
  join public.profiles p on p.id = ar.profile_id
  join public.batches b on b.id = p.batch_id
  where public.can_manage_access()
  order by case ar.state when 'pending' then 0 else 1 end, ar.created_at asc;
$$;
revoke all on function public.list_activation_queue() from public;
grant execute on function public.list_activation_queue() to authenticated;
