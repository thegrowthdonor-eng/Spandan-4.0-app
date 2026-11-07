-- Additive event type; existing published competitions keep their current behaviour.
alter table public.events add column if not exists registration_enabled boolean not null default true;

create or replace function public.guard_event_registration_mode()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if tg_op='UPDATE' and new.registration_enabled is distinct from old.registration_enabled then
    if old.state<>'draft' or exists(select 1 from public.applications where event_id=old.id)
      or exists(select 1 from public.participant_groups where event_id=old.id)
      or exists(select 1 from public.fixtures where event_id=old.id)
      or exists(select 1 from public.result_publications where event_id=old.id) then
      raise exception 'Event type is locked once it has entries or leaves draft' using errcode='55000';
    end if;
  end if;
  if not new.registration_enabled and new.state in ('open','closed') then raise exception 'Informational events cannot open or close registration' using errcode='22023'; end if;
  return new;
end;
$$;
revoke all on function public.guard_event_registration_mode() from public,anon,authenticated;
drop trigger if exists guard_event_registration_mode on public.events;
create trigger guard_event_registration_mode before insert or update on public.events for each row execute function public.guard_event_registration_mode();

create or replace function public.guard_competition_record()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.events where id=new.event_id and not registration_enabled) then
    raise exception 'This event is informational only; competition operations are disabled' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_competition_record() from public,anon,authenticated;
drop trigger if exists guard_information_applications on public.applications;
create trigger guard_information_applications before insert or update on public.applications for each row execute function public.guard_competition_record();
drop trigger if exists guard_information_groups on public.participant_groups;
create trigger guard_information_groups before insert or update on public.participant_groups for each row execute function public.guard_competition_record();
drop trigger if exists guard_information_fixtures on public.fixtures;
create trigger guard_information_fixtures before insert or update on public.fixtures for each row execute function public.guard_competition_record();
drop trigger if exists guard_information_results on public.result_publications;
create trigger guard_information_results before insert or update on public.result_publications for each row execute function public.guard_competition_record();
drop trigger if exists guard_information_points on public.point_rules;
create trigger guard_information_points before insert or update on public.point_rules for each row execute function public.guard_competition_record();

CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.events where id=p_event_id and registration_enabled) and (coalesce(auth.jwt()->>'role', '') = 'service_role'
    or exists (
      select 1
      from public.events e
      join public.access_records ar
        on ar.edition_id = e.edition_id
       and ar.profile_id = auth.uid()
       and ar.state = 'active'
      join public.staff_assignments sa
        on sa.profile_id = auth.uid()
       and sa.revoked_at is null
      where e.id = p_event_id
        and (
          sa.role = 'main_admin'
          or (sa.role = 'event_coordinator' and sa.event_id = e.id)
          or (sa.role = 'event_head' and sa.event_category = e.category)
        )
    ));
$function$;

CREATE OR REPLACE FUNCTION public.save_management_event(p_event_id uuid, p_edition_id uuid, p_details jsonb)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ev public.events; structural boolean; q jsonb; registration boolean;
begin
  if auth.uid() is null then raise exception 'Not authorised' using errcode='42501'; end if;
  if jsonb_typeof(p_details)<>'object' then raise exception 'Invalid event details' using errcode='22023'; end if;
  if p_details->>'scoreTemplate' not in ('generic','cricket','football','badminton','basketball','set_based')
    or jsonb_typeof(p_details->'applicationQuestions') is distinct from 'array'
    or jsonb_typeof(p_details->'eligibility') is distinct from 'object' then
    raise exception 'Invalid event configuration' using errcode='22023';
  end if;
  if jsonb_array_length(p_details->'applicationQuestions') > 30 then raise exception 'At most 30 questions are allowed' using errcode='22023'; end if;
  for q in select value from jsonb_array_elements(p_details->'applicationQuestions') loop
    if coalesce(length(btrim(q->>'label')),0) not between 1 and 200 or coalesce(length(q->>'key'),0) not between 1 and 80
      or coalesce(q->>'type','') not in ('text','select')
      or jsonb_typeof(q->'required') is distinct from 'boolean'
      or (coalesce(q->>'key','')||' '||coalesce(q->>'label','')) ~* '(roll|batch|full[ _-]?name|phone|mobile|gender|sex)' then
      raise exception 'Check registration question labels and types' using errcode='22023';
    end if;
    if q->>'type'='select' then
      if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Choice questions require options' using errcode='22023'; end if;
      if jsonb_array_length(q->'options') not between 2 and 20
        or exists(select 1 from jsonb_array_elements_text(q->'options') o where length(btrim(o)) not between 1 and 200)
        or (select count(distinct o) from jsonb_array_elements_text(q->'options') o)<>jsonb_array_length(q->'options') then
        raise exception 'Choice options must be nonempty and unique' using errcode='22023';
      end if;
    end if;
  end loop;
  if (select count(distinct question_record->>'key') from jsonb_array_elements(p_details->'applicationQuestions') question_record)<>jsonb_array_length(p_details->'applicationQuestions') then
    raise exception 'Question keys must be unique' using errcode='22023';
  end if;
  registration:=coalesce((p_details->>'registrationEnabled')::boolean,(select registration_enabled from public.events where id=p_event_id),true);
  if registration and p_details->>'format'='sport' then p_details:=jsonb_set(p_details,'{batchRestricted}','true'::jsonb); end if;
  if p_event_id is null then
    select * into ev from public.create_admin_event(p_edition_id,p_details->>'title',
      (p_details->>'category')::public.event_category,(p_details->>'format')::public.event_format,
      p_details->>'scoreTemplate',coalesce(p_details->>'summary',''),p_details->>'venue',
      (p_details->>'capacity')::integer,null,null,null,(p_details->>'startsAt')::timestamptz,null,
      coalesce(p_details->'eligibility'->>'division','open'));
  else
    select * into ev from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found' using errcode='P0002'; end if;
    if not public.can_edit_event_definition(ev.id) then raise exception 'Not authorised' using errcode='42501'; end if;
    structural:=ev.category::text is distinct from p_details->>'category'
      or ev.format::text is distinct from p_details->>'format'
      or ev.score_template is distinct from p_details->>'scoreTemplate'
      or ev.registration_enabled is distinct from registration;
    if structural then
      if ev.state<>'draft' or exists(select 1 from public.applications where event_id=ev.id)
        or exists(select 1 from public.participant_groups where event_id=ev.id)
        or exists(select 1 from public.fixtures where event_id=ev.id)
        or exists(select 1 from public.result_publications where event_id=ev.id) then
        raise exception 'Category, format and scoring are locked once an event has entries or leaves draft' using errcode='55000';
      end if;
      if p_details->>'scoreTemplate' not in ('generic','cricket','football','badminton','basketball','set_based') then
        raise exception 'Invalid scoring template' using errcode='22023';
      end if;
      update public.events set category=(p_details->>'category')::public.event_category,
        format=(p_details->>'format')::public.event_format,score_template=p_details->>'scoreTemplate' where id=ev.id;
    end if;
  end if;
  update public.events set registration_enabled=registration where id=ev.id;
  select * into ev from public.update_admin_event_full(ev.id,p_details->>'title',
    coalesce(p_details->>'summary',''),coalesce(p_details->>'rules',''),coalesce(p_details->>'venue',''),
    (p_details->>'capacity')::integer,coalesce((p_details->>'waitlistEnabled')::boolean,false),null,null,
    (p_details->>'rosterLockAt')::timestamptz,(p_details->>'reportingAt')::timestamptz,
    (p_details->>'startsAt')::timestamptz,(p_details->>'endsAt')::timestamptz,
    coalesce(p_details->'eligibility','{}'),coalesce(p_details->'applicationQuestions','[]'),
    (p_details->>'groupMinSize')::integer,(p_details->>'groupMaxSize')::integer,
    coalesce((p_details->>'batchRestricted')::boolean,false),p_details->>'posterUrl');
  return ev;
end;
$function$;

drop function public.list_admin_event_editor_data();
CREATE OR REPLACE FUNCTION public.list_admin_event_editor_data()
 RETURNS TABLE(event_id uuid, title text, category event_category, format event_format, score_template text, state event_state, summary text, rules_markdown text, venue text, application_capacity integer, waitlist_enabled boolean, application_opens_at timestamp with time zone, application_closes_at timestamp with time zone, roster_lock_at timestamp with time zone, reporting_at timestamp with time zone, starts_at timestamp with time zone, ends_at timestamp with time zone, eligibility jsonb, application_questions jsonb, group_min_size integer, group_max_size integer, batch_restricted boolean, poster_url text, structure_locked boolean, registration_enabled boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.title, e.category, e.format, e.score_template, e.state,
    e.summary, e.rules_markdown, e.venue,
    e.application_capacity, e.waitlist_enabled,
    e.application_opens_at, e.application_closes_at,
    e.roster_lock_at, e.reporting_at, e.starts_at, e.ends_at,
    e.eligibility, e.application_questions,
    e.group_min_size, e.group_max_size, e.batch_restricted, e.poster_url,
    e.state <> 'draft' or exists(select 1 from public.applications where event_id=e.id)
      or exists(select 1 from public.participant_groups where event_id=e.id)
      or exists(select 1 from public.fixtures where event_id=e.id)
      or exists(select 1 from public.result_publications where event_id=e.id)
    ,e.registration_enabled
  from public.events e
  where public.can_edit_event_definition(e.id)
  order by e.title;
$function$;

revoke all on function public.list_admin_event_editor_data() from public,anon;
grant execute on function public.list_admin_event_editor_data() to authenticated,service_role;
CREATE OR REPLACE FUNCTION public.set_admin_event_state(p_event_id uuid, p_state event_state)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  event_record public.events;
  edition public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select * into event_record from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if p_state not in ('draft', 'published', 'open', 'closed', 'ongoing', 'completed', 'cancelled') then
    raise exception 'Invalid event lifecycle action' using errcode = '22023';
  end if;
  if p_state in ('published', 'open')
     and (event_record.application_opens_at is null or event_record.application_closes_at is null) then
    select * into edition from public.editions where id = event_record.edition_id;
    if edition.registration_opens_at is not null and edition.registration_closes_at is not null then
      update public.events
      set application_opens_at = edition.registration_opens_at,
          application_closes_at = edition.registration_closes_at
      where id = p_event_id
      returning * into event_record;
    end if;
  end if;
  if p_state in ('published','open') and (
    nullif(btrim(event_record.summary),'') is null or (event_record.registration_enabled and nullif(btrim(event_record.rules_markdown),'') is null)
    or nullif(btrim(event_record.venue),'') is null or event_record.starts_at is null or event_record.ends_at is null
    or (event_record.registration_enabled and event_record.format<>'solo' and (event_record.group_min_size is null or event_record.group_max_size is null))
  ) then raise exception 'Complete summary, rules, venue, schedule and team sizes before publishing' using errcode='22023'; end if;
  update public.events set state = p_state where id = p_event_id returning * into event_record;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.state_changed', 'event', event_record.id, jsonb_build_object('state', p_state));
  return event_record;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_management_summary()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare admin boolean; access boolean; creator boolean; managed jsonb; editable jsonb;
begin
  if auth.uid() is null or not public.has_active_festival_access() then
    raise exception 'Active access required' using errcode='42501';
  end if;
  admin:=public.is_main_admin(); access:=public.can_manage_access(); creator:=public.can_create_events();
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'format',e.format,'state',e.state,'registration_enabled',e.registration_enabled,
    'pending',(select count(*) from public.applications a where a.event_id=e.id and a.review_state='submitted')) order by e.title),'[]') into managed
  from public.events e where public.can_manage_event(e.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'format',e.format,'state',e.state,'registration_enabled',e.registration_enabled) order by e.title),'[]') into editable
  from public.events e where public.can_edit_event_definition(e.id);
  return jsonb_build_object(
    'isAdmin',admin,'canVerify',access,'canCreate',creator,'canNotice',public.can_publish_notices(),
    'canGallery',public.can_manage_gallery_moments(),'canLive',public.can_manage_live_desk(),
    'canHelp',admin or access or jsonb_array_length(managed)>0,
    'roles',(select coalesce(jsonb_agg(distinct role),'[]') from public.staff_assignments where profile_id=auth.uid() and revoked_at is null),
    'events',managed,'editableEvents',editable,
    'pendingVerification',case when access then (select count(*) from public.access_records where state='pending') else null end
  );
end;
$function$;

create or replace function public.manage_team_proposal(p_event_id uuid,p_group_id uuid,p_action text,p_details jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.events; g public.participant_groups; leader public.applications; ids uuid[]; staff boolean; label text; reason text; selected_batch uuid;
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
    selected_batch:=nullif(p_details->>'batchId','')::uuid;
    if e.format='sport' and not exists(select 1 from public.batches where id=selected_batch and edition_id=e.edition_id and eligible) then raise exception 'Select an eligible batch before appointing a captain' using errcode='22023'; end if;
    select * into leader from public.applications where id=(p_details->>'leaderApplicationId')::uuid and event_id=e.id and review_state='approved';
    if not found or not exists(select 1 from public.access_records where profile_id=leader.student_id and edition_id=e.edition_id and state='active' and verified_at is not null) then raise exception 'Choose an active approved event participant' using errcode='22023'; end if;
    if e.format='sport' and not exists(select 1 from public.profiles where id=leader.student_id and batch_id=selected_batch) then raise exception 'Captain must belong to the selected batch' using errcode='22023'; end if;
    if p_group_id is null then
      if exists(select 1 from public.participant_groups where event_id=e.id and captain_id=leader.student_id and state<>'disbanded') or exists(select 1 from public.group_memberships where application_id=leader.id and removed_at is null) then raise exception 'This student already leads or belongs to a team' using errcode='22023'; end if;
      insert into public.participant_groups(event_id,name,batch_id,captain_id,created_by) select e.id,'Awaiting leader proposal',case when e.format='sport' then selected_batch when e.batch_restricted then p.batch_id else null end,leader.student_id,auth.uid() from public.profiles p where p.id=leader.student_id returning * into g;
    else
      select * into g from public.participant_groups where id=p_group_id and event_id=e.id for update;
      if not found or g.state='disbanded' then raise exception 'Team unavailable' using errcode='22023'; end if;
      if (e.batch_restricted or e.format='sport') and not exists(select 1 from public.profiles where id=leader.student_id and batch_id=g.batch_id) then raise exception 'Choose a leader from this team batch' using errcode='22023'; end if;
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



create or replace function public.attach_event_poster(p_event_id uuid,p_path text,p_url text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.can_edit_event_definition(p_event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
  perform 1 from public.events where id=p_event_id for update;
  if p_path is null or p_url is null or p_path not like 'posters/'||p_event_id::text||'/%' or right(p_path,5)<>'.webp'
    or p_url not like 'https://%/storage/v1/object/public/fest-media/'||p_path
    or not exists(select 1 from storage.objects where bucket_id='fest-media' and name=p_path) then
    raise exception 'Invalid uploaded poster' using errcode='22023';
  end if;
  update public.events set poster_url=p_url where id=p_event_id;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'event.poster_attached','event',p_event_id,jsonb_build_object('storage_path',p_path));
end;
$$;
revoke all on function public.attach_event_poster(uuid,text,text) from public,anon;
grant execute on function public.attach_event_poster(uuid,text,text) to authenticated,service_role;

notify pgrst,'reload schema';
