-- A stale form is a business conflict, not a serialisation failure to retry.
create or replace function public.manage_team_proposal(p_event_id uuid,p_group_id uuid,p_action text,p_details jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.events; g public.participant_groups; leader public.applications; ids uuid[]; staff boolean; label text; reason text;
begin
  if auth.uid() is null or not public.has_active_festival_access() then raise exception 'Active verified account required' using errcode='42501'; end if;
  -- All workflow writes lock the event first, serialising pair acceptance and roster publication.
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='42501'; end if;
  staff:=public.can_manage_event(e.id);
  if not public.has_active_festival_access(e.edition_id) then raise exception 'Active account required for this edition' using errcode='42501'; end if;
  if e.format='solo' or e.state in ('draft','cancelled','completed') or (e.roster_lock_at is not null and now()>=e.roster_lock_at) then raise exception 'This event roster is not editable' using errcode='22023'; end if;
  if p_action='appoint' then
    if not staff or e.format not in ('sport','group') then raise exception 'Only event staff can appoint a captain or group leader' using errcode='42501'; end if;
    select * into leader from public.applications where id=(p_details->>'leaderApplicationId')::uuid and event_id=e.id and review_state='approved';
    if not found or not exists(select 1 from public.access_records where profile_id=leader.student_id and edition_id=e.edition_id and state='active' and verified_at is not null) then raise exception 'Choose an active approved event participant' using errcode='22023'; end if;
    if p_group_id is null then
      if exists(select 1 from public.participant_groups where event_id=e.id and captain_id=leader.student_id and state<>'disbanded') or exists(select 1 from public.group_memberships where application_id=leader.id and removed_at is null) then raise exception 'This student already leads or belongs to a team' using errcode='22023'; end if;
      insert into public.participant_groups(event_id,name,batch_id,captain_id,created_by) select e.id,'Awaiting leader proposal',case when e.batch_restricted then p.batch_id else null end,leader.student_id,auth.uid() from public.profiles p where p.id=leader.student_id returning * into g;
    else
      select * into g from public.participant_groups where id=p_group_id and event_id=e.id for update;
      if not found or g.state='disbanded' then raise exception 'Team unavailable' using errcode='22023'; end if;
      if e.batch_restricted and not exists(select 1 from public.profiles where id=leader.student_id and batch_id=g.batch_id) then raise exception 'Choose a leader from this team batch' using errcode='22023'; end if;
      if g.state='published' and not(leader.id=any(g.proposed_application_ids)) then raise exception 'New captain must be an existing member' using errcode='22023'; end if;
      update public.participant_groups set captain_id=leader.student_id,roster_version=roster_version+1 where id=g.id returning * into g;
    end if;
  else
    select * into g from public.participant_groups where id=p_group_id and event_id=e.id for update;
    if not found or g.state='disbanded' or (not staff and (g.captain_id is distinct from auth.uid() or e.format='pair')) then raise exception 'Not authorised for this team' using errcode='42501'; end if;
    if (p_details->>'version')::integer is distinct from g.roster_version then raise exception 'This roster changed. Refresh before continuing.' using errcode='55000'; end if;
    reason:=nullif(btrim(p_details->>'reason'),'');
    if p_action='save' then
      if e.format='pair' then raise exception 'Partner changes require a new invitation' using errcode='22023'; end if;
      if not staff and (g.state='published' or g.proposal_state='submitted') then raise exception 'Wait for coordinator review or request a correction' using errcode='22023'; end if;
      if staff and char_length(coalesce(p_details->>'reason',''))>500 then raise exception 'Reason too long' using errcode='22023'; end if;
      if staff and g.captain_id is distinct from auth.uid() and not g.proposal_ready then raise exception 'The appointed leader must name and propose the initial squad' using errcode='22023'; end if;
      label:=nullif(btrim(p_details->>'name'),'');
      select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_details->'applicationIds');
      if label is null or char_length(label)>160 or coalesce(cardinality(ids),0)=0 or cardinality(ids)>coalesce(e.group_max_size,200) or cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Enter a name and distinct eligible members within the event limit' using errcode='22023'; end if;
      if not exists(select 1 from public.applications where id=any(ids) and student_id=g.captain_id) then raise exception 'Include the appointed leader in the squad' using errcode='22023'; end if;
      if (select count(*) from public.applications a join public.profiles p on p.id=a.student_id join public.access_records ar on ar.profile_id=p.id and ar.edition_id=e.edition_id where a.id=any(ids) and a.event_id=e.id and a.review_state='approved' and ar.state='active' and ar.verified_at is not null and (not e.batch_restricted or p.batch_id=g.batch_id))<>cardinality(ids) then raise exception 'Choose only active approved participants from this event and batch' using errcode='22023'; end if;
      if g.state='published' and reason is null then raise exception 'Explain this official roster correction' using errcode='22023'; end if;
      update public.participant_groups set name=label,proposed_application_ids=ids,proposal_ready=true,review_note=reason,roster_version=roster_version+1 where id=g.id returning * into g;
      if g.state='published' then g:=public.publish_participant_group(g.id,g.captain_id); end if;
    elsif p_action='submit' then
      if g.captain_id is distinct from auth.uid() or e.format='pair' or g.state<>'draft' or not g.proposal_ready or cardinality(g.proposed_application_ids)<coalesce(e.group_min_size,1) then raise exception 'Only the appointed leader can submit a complete proposal' using errcode='22023'; end if;
      update public.participant_groups set proposal_state='submitted',review_note=null,roster_version=roster_version+1 where id=g.id returning * into g;
    elsif p_action='return' then
      if not staff then raise exception 'Only event staff can review proposals' using errcode='42501'; end if;
      if g.state<>'draft' or reason is null then raise exception 'A draft proposal and explanation are required' using errcode='22023'; end if;
      update public.participant_groups set proposal_state=case when e.format='pair' then 'submitted' else 'changes_requested' end,review_note=reason,roster_version=roster_version+1 where id=g.id returning * into g;
    elsif p_action='dissolve' then
      if not staff then raise exception 'Only event staff can correct official pairs' using errcode='42501'; end if;
      if e.format<>'pair' or reason is null then raise exception 'Pair correction requires an explanation' using errcode='22023'; end if;
      insert into public.application_history(application_id,actor_id,from_review_state,to_review_state,from_selection_state,to_selection_state,reason)
        select a.id,auth.uid(),a.review_state,a.review_state,a.selection_state,'unselected',reason from public.applications a join public.group_memberships m on m.application_id=a.id where m.group_id=g.id and m.removed_at is null;
      update public.applications set selection_state='unselected' where id in(select application_id from public.group_memberships where group_id=g.id and removed_at is null);
      update public.group_memberships set removed_at=now() where group_id=g.id and removed_at is null;
      update public.pair_invitations set state='cancelled',group_id=null,responded_at=now() where group_id=g.id;
      update public.participant_groups set state='disbanded',published_at=null,review_note=reason,roster_version=roster_version+1 where id=g.id returning * into g;
    elsif p_action='publish' then
      if not staff then raise exception 'Only event staff can approve rosters' using errcode='42501'; end if;
      if g.proposal_state<>'submitted' then raise exception 'The leader or both partners must submit first' using errcode='22023'; end if;
      g:=public.publish_participant_group(g.id,g.captain_id);
      update public.participant_groups set roster_version=roster_version+1 where id=g.id returning * into g;
    else raise exception 'Unknown team action' using errcode='22023'; end if;
  end if;
  insert into public.audit_log(actor_id,action,object_type,object_id,reason,change_summary) values(auth.uid(),'team.'||p_action,'participant_group',g.id,reason,jsonb_build_object('version',g.roster_version,'application_ids',g.proposed_application_ids,'captain_id',g.captain_id,'name',g.name));
  return to_jsonb(g);
end;
$$;


create function public.enforce_pair_event_size()
returns trigger language plpgsql set search_path=public as $$
begin
  if new.format='pair' then new.group_min_size:=2; new.group_max_size:=2; end if;
  return new;
end;
$$;
revoke all on function public.enforce_pair_event_size() from public,anon,authenticated;
create trigger enforce_pair_event_size before insert or update of format,group_min_size,group_max_size on public.events for each row execute function public.enforce_pair_event_size();
update public.events set group_min_size=2,group_max_size=2 where format='pair' and (group_min_size is distinct from 2 or group_max_size is distinct from 2);
update public.participant_groups g set captain_id=null from public.events e where e.id=g.event_id and e.format='pair' and g.captain_id is not null;
notify pgrst,'reload schema';
