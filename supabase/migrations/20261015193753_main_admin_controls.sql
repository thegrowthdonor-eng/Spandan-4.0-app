alter type public.staff_role add value if not exists 'notice_publisher';

create or replace function public.is_main_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_assignments where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null);
$$;

create or replace function public.list_committee_members()
returns table (profile_id uuid, full_name text, fest_id text, batch_label text, role public.staff_role, event_id uuid, event_title text, granted_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.fest_id, b.label, s.role, s.event_id, e.title, s.granted_at
  from public.staff_assignments s join public.profiles p on p.id=s.profile_id join public.batches b on b.id=p.batch_id left join public.events e on e.id=s.event_id
  where s.revoked_at is null and public.is_main_admin() order by p.full_name, s.role;
$$;

create or replace function public.assign_committee_role(p_profile_id uuid, p_role public.staff_role, p_event_id uuid default null)
returns public.staff_assignments language plpgsql security definer set search_path = public as $$
declare assignment public.staff_assignments;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  if p_profile_id = auth.uid() and p_role = 'main_admin' then raise exception 'Use another main admin before changing your own access' using errcode='22023'; end if;
  if (p_role = 'event_head') <> (p_event_id is not null) then raise exception 'Event heads require exactly one assigned event' using errcode='22023'; end if;
  if p_event_id is not null and not exists (select 1 from public.events where id=p_event_id) then raise exception 'Event not found' using errcode='22023'; end if;
  insert into public.staff_assignments(profile_id,role,event_id,granted_by) values(p_profile_id,p_role,p_event_id,auth.uid()) returning * into assignment;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'committee.role_granted','staff_assignment',assignment.id,jsonb_build_object('role',p_role,'profile_id',p_profile_id,'event_id',p_event_id));
  return assignment;
end; $$;

create or replace function public.revoke_committee_role(p_assignment_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target public.staff_assignments; remaining_admins integer;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  select * into target from public.staff_assignments where id=p_assignment_id and revoked_at is null for update;
  if not found then raise exception 'Assignment not found' using errcode='P0002'; end if;
  if target.role='main_admin' then select count(*) into remaining_admins from public.staff_assignments where role='main_admin' and revoked_at is null; if remaining_admins <= 1 then raise exception 'At least one main admin is required' using errcode='22023'; end if; end if;
  update public.staff_assignments set revoked_at=now() where id=target.id;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'committee.role_revoked','staff_assignment',target.id,jsonb_build_object('role',target.role,'profile_id',target.profile_id));
end; $$;

revoke all on function public.is_main_admin(), public.list_committee_members(), public.assign_committee_role(uuid,public.staff_role,uuid), public.revoke_committee_role(uuid) from public, anon;
grant execute on function public.is_main_admin(), public.list_committee_members(), public.assign_committee_role(uuid,public.staff_role,uuid), public.revoke_committee_role(uuid) to authenticated;
