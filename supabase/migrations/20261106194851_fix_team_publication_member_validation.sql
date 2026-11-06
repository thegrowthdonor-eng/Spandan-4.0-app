-- Keep record variables distinct from SQL aliases in roster validation.
create or replace function public.publish_participant_group(p_group_id uuid,p_captain_id uuid default null)
returns public.participant_groups language plpgsql security definer set search_path=public as $$
declare g public.participant_groups; e public.events; ids uuid[]; member_record public.applications; n integer;
begin
  select * into g from public.participant_groups where id=p_group_id for update;
  if not found or auth.uid() is null or not public.can_manage_event(g.event_id) then raise exception 'Not authorised for this event' using errcode='42501'; end if;
  select * into e from public.events where id=g.event_id;
  if e.format='solo' or e.state in ('draft','cancelled','completed') or (e.roster_lock_at is not null and now()>=e.roster_lock_at) then raise exception 'This event roster is not editable' using errcode='22023'; end if;
  ids:=g.proposed_application_ids; n:=cardinality(ids);
  if not g.proposal_ready or n=0 or (e.format='pair' and n<>2) or n<coalesce(e.group_min_size,1) or n>coalesce(e.group_max_size,200) then raise exception 'Complete the proposed roster within the event size limits' using errcode='22023'; end if;
  if e.format='pair' and not exists(select 1 from public.pair_invitations i where i.group_id=g.id and i.state='accepted'
    and (select array_agg(student_id order by student_id) from public.applications where id=any(ids))=array(select x from unnest(array[i.sender_id,i.recipient_id]) x order by x)) then raise exception 'Both partners must accept their pair' using errcode='22023'; end if;
  if e.format in ('group','sport') and (p_captain_id is null or not exists(select 1 from public.applications where id=any(ids) and student_id=p_captain_id)) then raise exception 'The captain or group leader must be in the roster' using errcode='22023'; end if;
  if (select count(distinct x) from unnest(ids) x)<>n then raise exception 'Duplicate roster member' using errcode='22023'; end if;
  perform 1 from public.applications where id=any(ids) order by id for update;
  if (select count(*) from public.applications where id=any(ids))<>n then raise exception 'Participant no longer available' using errcode='22023'; end if;
  for member_record in select * from public.applications where id=any(ids) loop
    if member_record.event_id<>e.id or member_record.review_state<>'approved' or not exists(select 1 from public.access_records where profile_id=member_record.student_id and edition_id=e.edition_id and state='active' and verified_at is not null)
      or (e.batch_restricted and not exists(select 1 from public.profiles where id=member_record.student_id and batch_id=g.batch_id))
      or exists(select 1 from public.profiles p where p.id=member_record.student_id and coalesce(e.eligibility->>'division','open') in ('boys','girls') and p.gender is distinct from case e.eligibility->>'division' when 'boys' then 'male' else 'female' end)
      or exists(select 1 from public.group_memberships where application_id=member_record.id and removed_at is null and group_id<>g.id) then raise exception 'A proposed member is ineligible or already in another team' using errcode='22023'; end if;
  end loop;
  insert into public.application_history(application_id,actor_id,from_review_state,to_review_state,from_selection_state,to_selection_state,reason)
    select a.id,auth.uid(),a.review_state,a.review_state,a.selection_state,'unselected','Roster correction: '||coalesce(g.review_note,'member removed')
    from public.applications a join public.group_memberships m on m.application_id=a.id where m.group_id=g.id and m.removed_at is null and not(a.id=any(ids));
  update public.applications set selection_state='unselected' where id in(select application_id from public.group_memberships where group_id=g.id and removed_at is null) and not(id=any(ids));
  update public.group_memberships set removed_at=now() where group_id=g.id and removed_at is null and not(application_id=any(ids));
  insert into public.group_memberships(group_id,application_id,added_by) select g.id,x,auth.uid() from unnest(ids) x where not exists(select 1 from public.group_memberships where group_id=g.id and application_id=x and removed_at is null);
  insert into public.application_history(application_id,actor_id,from_review_state,to_review_state,from_selection_state,to_selection_state,reason)
    select id,auth.uid(),review_state,review_state,selection_state,'selected','Official roster publication' from public.applications where id=any(ids) and selection_state<>'selected';
  update public.applications set selection_state='selected' where id=any(ids);
  update public.participant_groups set captain_id=case when e.format='pair' then null else p_captain_id end,state='published',proposal_state='published',published_at=coalesce(published_at,now()) where id=g.id returning * into g;
  insert into public.audit_log(actor_id,action,object_type,object_id,reason,change_summary) values(auth.uid(),'group.publish','participant_group',g.id,g.review_note,jsonb_build_object('application_ids',ids,'captain_id',g.captain_id));
  return g;
end;
$$;
