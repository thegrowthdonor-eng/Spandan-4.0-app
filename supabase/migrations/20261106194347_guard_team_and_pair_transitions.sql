-- Close registration, eligibility and legacy-transition edge cases.
create or replace function public.publish_participant_group(p_group_id uuid,p_captain_id uuid default null)
returns public.participant_groups language plpgsql security definer set search_path=public as $$
declare g public.participant_groups; e public.events; ids uuid[]; a public.applications; n integer;
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
  for a in select * from public.applications where id=any(ids) loop
    if a.event_id<>e.id or a.review_state<>'approved' or not exists(select 1 from public.access_records where profile_id=a.student_id and edition_id=e.edition_id and state='active' and verified_at is not null)
      or (e.batch_restricted and not exists(select 1 from public.profiles where id=a.student_id and batch_id=g.batch_id))
      or exists(select 1 from public.profiles p where p.id=a.student_id and coalesce(e.eligibility->>'division','open') in ('boys','girls') and p.gender is distinct from case e.eligibility->>'division' when 'boys' then 'male' else 'female' end)
      or exists(select 1 from public.group_memberships where application_id=a.id and removed_at is null and group_id<>g.id) then raise exception 'A proposed member is ineligible or already in another team' using errcode='22023'; end if;
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
    if (p_details->>'version')::integer is distinct from g.roster_version then raise exception 'This roster changed. Refresh before continuing.' using errcode='40001'; end if;
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

create or replace function public.pair_invitation_command(p_event_id uuid,p_action text,p_invitation_id uuid default null,p_partner_id uuid default null,p_answers jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.events; i public.pair_invitations; a public.applications; b public.applications; g public.participant_groups; partner uuid;
begin
  if auth.uid() is null or not public.has_active_festival_access() then raise exception 'Active verified account required' using errcode='42501'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or e.format<>'pair' or e.state in ('draft','cancelled','completed') or (e.roster_lock_at is not null and now()>=e.roster_lock_at) then raise exception 'Pair registration is unavailable or locked' using errcode='22023'; end if;
  if not public.has_active_festival_access(e.edition_id) then raise exception 'Active account required for this edition' using errcode='42501'; end if;
  if p_action='invite' then
    if e.state<>'open' or e.application_opens_at is null or e.application_closes_at is null or now()<e.application_opens_at or now()>=e.application_closes_at then raise exception 'Event registration is closed' using errcode='22023'; end if;
    select * into a from public.applications where event_id=e.id and student_id=auth.uid();
    if not found then a:=public.apply_to_event(e.id,gen_random_uuid(),p_answers); end if;
    if a.review_state in ('withdrawn','rejected') then raise exception 'Your registration needs organiser review' using errcode='22023'; end if;
    if p_partner_id is null or p_partner_id=auth.uid() or not exists(select 1 from public.profiles p join public.access_records ar on ar.profile_id=p.id and ar.edition_id=e.edition_id where p.id=p_partner_id and ar.state='active' and ar.verified_at is not null
      and (not e.batch_restricted or p.batch_id=(select batch_id from public.profiles where id=auth.uid()))
      and (coalesce(e.eligibility->>'division','open') not in ('boys','girls') or p.gender=case e.eligibility->>'division' when 'boys' then 'male' else 'female' end)) then raise exception 'Partner is not eligible for this event' using errcode='22023'; end if;
    if exists(select 1 from public.group_memberships m join public.applications app on app.id=m.application_id where app.event_id=e.id and app.student_id in(auth.uid(),p_partner_id) and m.removed_at is null) then raise exception 'One of you already has a confirmed pair' using errcode='22023'; end if;
    if (select count(*) from public.pair_invitations where event_id=e.id and sender_id=auth.uid() and state='pending')>=5 or (select count(*) from public.pair_invitations where sender_id=auth.uid() and created_at>now()-interval '1 hour')>=20 then raise exception 'Too many invitations. Cancel a pending invitation or try later.' using errcode='22023'; end if;
    insert into public.pair_invitations(event_id,sender_id,recipient_id) values(e.id,auth.uid(),p_partner_id) returning * into i;
  else
    select * into i from public.pair_invitations where id=p_invitation_id and event_id=e.id and auth.uid() in(sender_id,recipient_id) for update;
    if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
    if p_action='accept' then
      if i.recipient_id<>auth.uid() then raise exception 'Only the invited partner can accept' using errcode='42501'; end if;
      if i.state='accepted' then return to_jsonb(i); end if;
      if e.state<>'open' or e.application_opens_at is null or e.application_closes_at is null or now()<e.application_opens_at or now()>=e.application_closes_at then raise exception 'Event registration is closed' using errcode='22023'; end if;
      if i.state<>'pending' then raise exception 'This invitation is no longer pending' using errcode='22023'; end if;
      select * into a from public.applications where event_id=e.id and student_id=auth.uid();
      if not found then a:=public.apply_to_event(e.id,gen_random_uuid(),p_answers); end if;
      select * into b from public.applications where event_id=e.id and student_id=i.sender_id;
      if a.id is null or b.id is null or a.review_state in ('withdrawn','rejected') or b.review_state in ('withdrawn','rejected')
        or not exists(select 1 from public.access_records where profile_id=i.sender_id and edition_id=e.edition_id and state='active' and verified_at is not null)
        or (e.batch_restricted and (select batch_id from public.profiles where id=a.student_id) is distinct from (select batch_id from public.profiles where id=b.student_id)) then raise exception 'Both partners need eligible active event registrations' using errcode='22023'; end if;
      if exists(select 1 from public.profiles p where p.id in(i.sender_id,i.recipient_id) and coalesce(e.eligibility->>'division','open') in ('boys','girls') and p.gender is distinct from case e.eligibility->>'division' when 'boys' then 'male' else 'female' end) then raise exception 'Both partners must meet the event division' using errcode='22023'; end if;
      if exists(select 1 from public.group_memberships m join public.applications app on app.id=m.application_id where app.event_id=e.id and app.student_id in(i.sender_id,i.recipient_id) and m.removed_at is null) then raise exception 'One of you already has a confirmed pair' using errcode='22023'; end if;
      insert into public.participant_groups(event_id,batch_id,name,created_by,proposal_ready,proposal_state,proposed_application_ids)
        select e.id,case when e.batch_restricted then p.batch_id else null end,left(p.full_name||' & '||q.full_name,160),i.sender_id,true,'submitted',array[b.id,a.id] from public.profiles p,public.profiles q where p.id=i.sender_id and q.id=i.recipient_id returning * into g;
      update public.pair_invitations set state='accepted',group_id=g.id,responded_at=now() where id=i.id returning * into i;
      insert into public.group_memberships(group_id,application_id,added_by) values(g.id,a.id,auth.uid()),(g.id,b.id,auth.uid());
      update public.pair_invitations set state='cancelled',responded_at=now() where event_id=e.id and state='pending' and (sender_id in(i.sender_id,i.recipient_id) or recipient_id in(i.sender_id,i.recipient_id));
    elsif p_action in ('decline','cancel') then
      if (p_action='decline' and auth.uid()<>i.recipient_id) or (p_action='cancel' and auth.uid()<>i.sender_id) then raise exception 'Not authorised for this invitation action' using errcode='42501'; end if;
      if i.state<>'pending' then raise exception 'This invitation is no longer pending' using errcode='22023'; end if;
      update public.pair_invitations set state=case when p_action='decline' then 'declined' else 'cancelled' end,responded_at=now() where id=i.id returning * into i;
    elsif p_action='leave' then
      select * into g from public.participant_groups where id=i.group_id for update;
      if i.state<>'accepted' or g.state<>'draft' then raise exception 'Published pair corrections require the coordinator' using errcode='22023'; end if;
      update public.group_memberships set removed_at=now() where group_id=g.id and removed_at is null;
      update public.participant_groups set state='disbanded',proposal_state='draft',roster_version=roster_version+1 where id=g.id;
      update public.pair_invitations set state='cancelled',group_id=null,responded_at=now() where id=i.id returning * into i;
    else raise exception 'Unknown invitation action' using errcode='22023'; end if;
  end if;
  insert into public.audit_log(actor_id,action,object_type,object_id) values(auth.uid(),'pair.'||p_action,'pair_invitation',i.id);
  return to_jsonb(i);
end;
$$;

create or replace function public.find_pair_partner(p_event_id uuid,p_batch_id uuid,p_roll text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.has_active_festival_access() or char_length(btrim(p_roll)) not between 1 and 30 then raise exception 'Active account and exact roll required' using errcode='42501'; end if;
  if not public.consume_auth_rate_limit(encode(sha256(convert_to('pair-lookup:'||auth.uid()::text,'UTF8')),'hex'),30,900) then raise exception 'Too many partner lookups. Try again in 15 minutes.' using errcode='22023'; end if;
  if not exists(select 1 from public.events e where e.id=p_event_id and e.format='pair' and e.state='open' and now()>=e.application_opens_at and now()<e.application_closes_at and public.has_active_festival_access(e.edition_id)) then raise exception 'Pair registration is closed' using errcode='22023'; end if;
  select jsonb_build_object('id',p.id,'fullName',p.full_name,'roll',p.roll_canonical,'batchLabel',b.label) into result
    from public.profiles p join public.batches b on b.id=p.batch_id join public.events e on e.id=p_event_id join public.access_records ar on ar.profile_id=p.id and ar.edition_id=e.edition_id
    where p.batch_id=p_batch_id and p.roll_canonical=btrim(p_roll) and p.id<>auth.uid() and ar.state='active' and ar.verified_at is not null
      and (not e.batch_restricted or p.batch_id=(select batch_id from public.profiles where id=auth.uid()))
      and (coalesce(e.eligibility->>'division','open') not in ('boys','girls') or p.gender=case e.eligibility->>'division' when 'boys' then 'male' else 'female' end);
  return result;
end;
$$;

-- Prevent withdrawal/rejection from leaving a confirmed pair or official team claimed.
create function public.guard_group_application_review()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.review_state is distinct from old.review_state and new.review_state in ('withdrawn','rejected') and exists(select 1 from public.group_memberships where application_id=new.id and removed_at is null) then
    raise exception 'Leave your unconfirmed pair first, or ask the coordinator to correct the official roster before withdrawing/rejecting.' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_group_application_review() from public,anon,authenticated;
create trigger guard_group_application_review before update of review_state on public.applications for each row execute function public.guard_group_application_review();
notify pgrst,'reload schema';
