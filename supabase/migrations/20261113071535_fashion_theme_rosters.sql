-- Theme rules are opt-in metadata; other event workflows retain their existing checks.
create or replace function public.theme_registration_size(policy jsonb, answers jsonb)
returns integer language plpgsql immutable security invoker set search_path=public as $$
declare theme text; character text; required_size integer;
begin
  if policy is null then return null; end if;
  theme := answers->>(policy->>'themeQuestionKey');
  character := answers->>(policy->>'characterQuestionKey');
  if jsonb_typeof(answers->(policy->>'themeQuestionKey')) is distinct from 'string'
    or not coalesce((policy->'sizes') ? theme,false) then
    raise exception 'Choose your theme.' using errcode='22023';
  end if;
  required_size := (policy->'sizes'->>theme)::integer;
  if required_size is null or required_size not in (1,2) then raise exception 'Invalid theme roster policy.' using errcode='22023'; end if;
  if jsonb_typeof(answers->(policy->>'characterQuestionKey')) is distinct from 'string'
    or regexp_replace(coalesce(character,''),'[[:space:]  -   　﻿]','','g')='' or char_length(character)>500 then
    raise exception 'Enter the character you will portray (1–500 characters).' using errcode='22023';
  end if;
  return required_size;
end;
$$;

create or replace function public.check_theme_registration()
returns trigger language plpgsql security invoker set search_path=public as $$
declare policy jsonb;
begin
  select eligibility->'theme_roster_policy' into policy from public.events where id=new.event_id;
  if policy is null then return new; end if;
  perform public.theme_registration_size(policy,new.answers);
  if tg_op='UPDATE' and (old.event_id is distinct from new.event_id or old.answers->>(policy->>'themeQuestionKey') is distinct from new.answers->>(policy->>'themeQuestionKey'))
    and exists(select 1 from public.participant_groups where event_id=old.event_id and state<>'disbanded' and old.id=any(proposed_application_ids)) then
    raise exception 'A proposed performer cannot change theme. Ask the coordinator to correct the roster first.' using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger check_theme_registration before insert or update of answers,event_id on public.applications
for each row execute function public.check_theme_registration();

create or replace function public.check_theme_roster()
returns trigger language plpgsql security invoker set search_path=public as $$
declare policy jsonb; a public.applications; theme text; member_theme text; required_size integer; n integer;
begin
  select eligibility->'theme_roster_policy' into policy from public.events where id=new.event_id;
  if policy is null or new.state='disbanded' or not new.proposal_ready then return new; end if;
  n:=cardinality(new.proposed_application_ids);
  if coalesce(n,0)=0 then raise exception 'Select the performers for this theme.' using errcode='22023'; end if;
  for a in select * from public.applications where id=any(new.proposed_application_ids) and event_id=new.event_id order by id for update loop
    required_size:=public.theme_registration_size(policy,a.answers);
    member_theme:=a.answers->>(policy->>'themeQuestionKey');
    if theme is not null and theme<>member_theme then raise exception 'All performers must register for the same theme.' using errcode='22023'; end if;
    theme:=member_theme;
  end loop;
  if theme is null or (select count(*) from public.applications where id=any(new.proposed_application_ids) and event_id=new.event_id)<>n then
    raise exception 'Choose registered performers from this event.' using errcode='22023';
  end if;
  if n>required_size or ((new.state='published' or new.proposal_state='submitted') and n<>required_size) then
    raise exception '% requires exactly % performer(s).',theme,required_size using errcode='22023';
  end if;
  return new;
end;
$$;
create trigger check_theme_roster before insert or update on public.participant_groups
for each row execute function public.check_theme_roster();

revoke all on function public.theme_registration_size(jsonb,jsonb),public.check_theme_registration(),public.check_theme_roster() from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.get_team_workspace(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e public.events; staff boolean; leader boolean; groups jsonb; candidates jsonb; invitations jsonb;
begin
  if auth.uid() is null or not public.has_active_festival_access() then raise exception 'Active verified account required' using errcode='42501'; end if;
  select * into e from public.events where id=p_event_id;
  e.batch_restricted:=e.batch_restricted or e.format='sport';
  if not e.registration_enabled then raise exception 'This event is informational only' using errcode='22023'; end if;
  staff:=public.can_manage_event(p_event_id);
  if not found or e.format='solo' or (not staff and e.state='draft') then raise exception 'Event unavailable' using errcode='42501'; end if;
  leader:=exists(select 1 from public.participant_groups where event_id=e.id and captain_id=auth.uid() and state<>'disbanded');
  select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,'state',g.state,'proposalState',g.proposal_state,'ready',g.proposal_ready,'captainId',g.captain_id,'batchId',g.batch_id,'version',g.roster_version,'note',g.review_note,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('applicationId',a.id,'studentId',p.id,'fullName',p.full_name,'batchId',p.batch_id,'batchLabel',b.label,'roll',p.roll_canonical,'reviewState',a.review_state,'theme',a.answers->(e.eligibility->'theme_roster_policy'->>'themeQuestionKey'),'character',a.answers->(e.eligibility->'theme_roster_policy'->>'characterQuestionKey')) order by p.full_name),'[]') from public.applications a join public.profiles p on p.id=a.student_id left join public.batches b on b.id=p.batch_id where a.id=any(g.proposed_application_ids))) order by g.created_at),'[]') into groups from public.participant_groups g where g.event_id=e.id and g.state<>'disbanded' and (staff or g.captain_id=auth.uid() or exists(select 1 from public.group_memberships m join public.applications a on a.id=m.application_id where m.group_id=g.id and m.removed_at is null and a.student_id=auth.uid()));
  candidates:='[]';
  if e.format in('sport','group') and (staff or leader) then
    select coalesce(jsonb_agg(jsonb_build_object('applicationId',a.id,'studentId',p.id,'fullName',p.full_name,'batchId',p.batch_id,'batchLabel',b.label,'roll',p.roll_canonical,'theme',a.answers->(e.eligibility->'theme_roster_policy'->>'themeQuestionKey'),'character',a.answers->(e.eligibility->'theme_roster_policy'->>'characterQuestionKey')) order by p.full_name),'[]') into candidates from public.applications a join public.profiles p on p.id=a.student_id left join public.batches b on b.id=p.batch_id join public.access_records ar on ar.profile_id=p.id and ar.edition_id=e.edition_id
      where a.event_id=e.id and a.review_state='approved' and ar.state='active' and ar.verified_at is not null and (staff or not e.batch_restricted or exists(select 1 from public.participant_groups where event_id=e.id and captain_id=auth.uid() and batch_id=p.batch_id and state<>'disbanded'));
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'state',i.state,'incoming',i.recipient_id=auth.uid(),'partnerName',p.full_name,'partnerBatch',b.label,'partnerRoll',p.roll_canonical,'groupId',i.group_id,'createdAt',i.created_at) order by i.created_at desc),'[]') into invitations from public.pair_invitations i join public.profiles p on p.id=case when i.sender_id=auth.uid() then i.recipient_id else i.sender_id end left join public.batches b on b.id=p.batch_id where i.event_id=e.id and auth.uid() in(i.sender_id,i.recipient_id) and i.state in('pending','accepted');
  return jsonb_build_object('eventId',e.id,'title',e.title,'format',e.format,'staff',staff,'userId',auth.uid(),'batchRestricted',e.batch_restricted,'minSize',case when e.format='pair' then 2 else coalesce(e.group_min_size,1) end,'maxSize',case when e.format='pair' then 2 else coalesce(e.group_max_size,200) end,'locked',e.state in('draft','cancelled','completed') or (e.roster_lock_at is not null and now()>=e.roster_lock_at),'groups',groups,'candidates',candidates,'invitations',invitations,'questions',e.application_questions,'themePolicy',e.eligibility->'theme_roster_policy',
    'registered',exists(select 1 from public.applications where event_id=e.id and student_id=auth.uid()),
    'batches',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'label',label) order by label),'[]') from public.batches where edition_id=e.edition_id));
end;
$function$;

notify pgrst,'reload schema';
