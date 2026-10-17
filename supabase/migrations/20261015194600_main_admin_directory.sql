-- Main-admin-only directory reads. These deliberately return the smallest
-- operational fields needed to assign committee responsibilities.
create or replace function public.list_committee_candidates()
returns table (profile_id uuid, full_name text, fest_id text, batch_label text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.fest_id, b.label
  from public.profiles p
  join public.batches b on b.id = p.batch_id
  join public.access_records ar on ar.profile_id = p.id
  where ar.state = 'active' and public.is_main_admin()
  order by p.full_name;
$$;

create or replace function public.list_all_events_for_admin()
returns table (event_id uuid, title text, category public.event_category, state public.event_state)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.category, e.state
  from public.events e
  where public.is_main_admin()
  order by e.title;
$$;

create or replace function public.assign_committee_role(
  p_profile_id uuid,
  p_role public.staff_role,
  p_event_id uuid default null
)
returns public.staff_assignments language plpgsql security definer set search_path = public as $$
declare assignment public.staff_assignments;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  if not exists (
    select 1 from public.profiles p
    join public.access_records ar on ar.profile_id = p.id
    where p.id = p_profile_id and ar.state = 'active'
  ) then raise exception 'Committee access can only be assigned to an active student account' using errcode='22023'; end if;
  if (p_role = 'event_head') <> (p_event_id is not null) then raise exception 'Event heads require exactly one assigned event' using errcode='22023'; end if;
  if p_event_id is not null and not exists (select 1 from public.events where id=p_event_id) then raise exception 'Event not found' using errcode='22023'; end if;
  insert into public.staff_assignments(profile_id,role,event_id,granted_by)
  values(p_profile_id,p_role,p_event_id,auth.uid()) returning * into assignment;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
  values(auth.uid(),'committee.role_granted','staff_assignment',assignment.id,
    jsonb_build_object('role',p_role,'profile_id',p_profile_id,'event_id',p_event_id));
  return assignment;
end;
$$;

revoke all on function public.list_committee_candidates() from public, anon;
revoke all on function public.list_all_events_for_admin() from public, anon;
revoke all on function public.assign_committee_role(uuid, public.staff_role, uuid) from public, anon;
grant execute on function public.list_committee_candidates() to authenticated;
grant execute on function public.list_all_events_for_admin() to authenticated;
grant execute on function public.assign_committee_role(uuid, public.staff_role, uuid) to authenticated;
