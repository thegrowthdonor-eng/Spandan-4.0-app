set lock_timeout='5s';
set statement_timeout='60s';

-- Refuse to silently rewrite teams that organisers have already formed.
do $$ begin
  if exists(select 1 from public.participant_groups g join public.events e on e.id=g.event_id
    where e.format='sport' and g.state<>'disbanded' and (
      g.batch_id is null
      or not exists(select 1 from public.batches where id=g.batch_id and edition_id=e.edition_id)
      or not exists(select 1 from public.profiles where id=g.captain_id and batch_id=g.batch_id)
      or exists(select 1 from public.applications a join public.profiles p on p.id=a.student_id
        where a.id=any(g.proposed_application_ids) and (a.event_id<>e.id or p.batch_id is distinct from g.batch_id))
      or exists(select 1 from public.group_memberships m join public.applications a on a.id=m.application_id join public.profiles p on p.id=a.student_id
        where m.group_id=g.id and m.removed_at is null and (a.event_id<>e.id or p.batch_id is distinct from g.batch_id))
    )) then raise exception 'Sports squad batch or member data is inconsistent. Correct the existing squad before applying this migration.'; end if;
  if exists(select 1 from public.participant_groups g join public.events e on e.id=g.event_id
    where e.format='sport' and g.state<>'disbanded' group by g.event_id,g.batch_id having count(*)>1) then
    raise exception 'More than one active sports squad exists for a batch. Resolve the duplicate squads before applying this migration.';
  end if;
end $$;

update public.events set batch_restricted=true where format='sport' and not batch_restricted;
alter table public.events add constraint sports_squads_same_batch check(format<>'sport' or batch_restricted);

create function private.guard_batch_squad() returns trigger
language plpgsql security definer set search_path='' as $$
declare e public.events;
begin
  -- All squad creation paths serialize on the event, including direct privileged writes.
  select * into e from public.events where id=new.event_id for update;
  if e.format<>'sport' or new.state='disbanded' then return new; end if;
  if new.batch_id is null or not exists(select 1 from public.batches where id=new.batch_id and edition_id=e.edition_id)
    or not exists(select 1 from public.profiles where id=new.captain_id and batch_id=new.batch_id and participant_category='ug') then
    raise exception 'Choose a captain from this team batch.' using errcode='22023';
  end if;
  if exists(select 1 from public.participant_groups where event_id=new.event_id and batch_id=new.batch_id and state<>'disbanded' and id<>new.id) then
    raise exception 'This batch already has a team for this event. Update its existing captain or roster.' using errcode='23505',detail='batch_team_exists';
  end if;
  if exists(select 1 from unnest(new.proposed_application_ids) chosen(id)
    left join public.applications a on a.id=chosen.id left join public.profiles p on p.id=a.student_id
    where a.id is null or a.event_id<>e.id or p.batch_id is distinct from new.batch_id) then
    raise exception 'Choose registered participants from this event and batch.' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function private.guard_batch_squad() from public,anon,authenticated;
create trigger guard_batch_squad before insert or update on public.participant_groups
for each row execute function private.guard_batch_squad();

create or replace function public.apply_to_event(p_event_id uuid,p_idempotency_key uuid,p_answers jsonb default '{}')
returns public.applications language plpgsql security definer set search_path='' as $$
declare e public.events; p public.profiles; a public.applications; current_access public.access_records;
  required_gender text; question jsonb; answer text; application_count integer:=0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
  select * into p from public.profiles where id=auth.uid();
  if not found then raise exception 'Profile unavailable' using errcode='42501',detail='profile_unavailable'; end if;
  if p.participant_category<>'ug' then raise exception 'Use the separate senior registration.' using errcode='42501'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or not e.registration_enabled or e.state in ('draft','published','cancelled','completed','ongoing') then
    raise exception 'Registration unavailable' using errcode='22023',detail='unavailable';
  end if;
  if e.state='closed' or (e.application_closes_at is not null and now()>=e.application_closes_at) then
    raise exception 'Registration closed' using errcode='22023',detail='closed';
  end if;
  if e.application_opens_at is null or e.application_closes_at is null then
    raise exception 'Registration not scheduled' using errcode='22023',detail='unavailable';
  end if;
  if now()<e.application_opens_at then raise exception 'Registration opens later' using errcode='22023',detail='scheduled'; end if;
  select * into current_access from public.access_records where edition_id=e.edition_id and profile_id=p.id;
  if not found or current_access.state<>'active' or current_access.verified_at is null then
    raise exception 'Account is not active for registration' using errcode='42501',detail='access_inactive';
  end if;
  required_gender:=case lower(coalesce(e.eligibility->>'division','open')) when 'boys' then 'male' when 'girls' then 'female' else null end;
  if required_gender is not null and p.gender is distinct from required_gender then
    raise exception 'Outside registered gender division' using errcode='42501',detail='gender_mismatch';
  end if;
  if p_idempotency_key is null or jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'Invalid registration answers' using errcode='22023',detail='invalid_answers';
  end if;
  for question in select value from jsonb_array_elements(coalesce(e.application_questions,'[]')) loop
    answer:=nullif(btrim(p_answers->>(question->>'key')),'');
    if (coalesce((question->>'required')::boolean,false) and answer is null) or length(answer)>500
      or (question->>'type'='select' and answer is not null and not exists(select 1 from jsonb_array_elements_text(question->'options') v where v=answer)) then
      raise exception 'Check required questions and listed choices' using errcode='22023',detail='invalid_answers';
    end if;
  end loop;
  if exists(select 1 from jsonb_each(p_answers) supplied where jsonb_typeof(supplied.value)<>'string'
    or not exists(select 1 from jsonb_array_elements(coalesce(e.application_questions,'[]')) q where q->>'key'=supplied.key)) then
    raise exception 'Unknown or invalid answer' using errcode='22023',detail='invalid_answers';
  end if;
  begin
    perform public.theme_registration_size(e.eligibility->'theme_roster_policy',p_answers);
  exception when invalid_parameter_value then
    raise exception 'Check your theme and character answers' using errcode='22023',detail='invalid_answers';
  end;
  select * into a from public.applications where event_id=e.id and student_id=p.id;
  if found then return a; end if;
  if exists(select 1 from public.applications where student_id=p.id and idempotency_key=p_idempotency_key) then
    raise exception 'Use a fresh registration request for this event' using errcode='22023',detail='invalid_answers';
  end if;
  -- Capacity is an application limit only for solo events; roster sizes never cap the pool.
  if e.format='solo' and e.application_capacity is not null then
    select count(*) into application_count from public.applications where event_id=e.id and review_state<>'withdrawn';
    if application_count>=e.application_capacity and not e.waitlist_enabled then
      raise exception 'Individual event capacity full' using errcode='23505',detail='capacity_full';
    end if;
  end if;
  insert into public.applications(event_id,student_id,idempotency_key,review_state,reviewed_at,answers)
    values(e.id,p.id,p_idempotency_key,
      case when e.format='solo' and e.application_capacity is not null and application_count>=e.application_capacity then 'waitlisted'::public.application_review_state else 'submitted'::public.application_review_state end,
      case when e.format='solo' and e.application_capacity is not null and application_count>=e.application_capacity then now() else null end,p_answers)
    returning * into a;
  insert into public.application_history(application_id,actor_id,to_review_state,to_selection_state) values(a.id,p.id,a.review_state,a.selection_state);
  return a;
end $$;
revoke all on function public.apply_to_event(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_to_event(uuid,uuid,jsonb) to authenticated;

-- Preserve the existing invitation, consent, publication and senior-isolation checks.
do $$
declare definition text; original text;
begin
  original:=pg_get_functiondef('public.pair_invitation_command(uuid,text,uuid,uuid,jsonb)'::regprocedure);
  definition:=replace(original,'if not found then a:=public.apply_to_event(e.id,gen_random_uuid(),p_answers); end if;',
    'if not found then raise exception ''Register individually for this event before pairing.'' using errcode=''22023''; end if;');
  if definition=original or definition like '%a:=public.apply_to_event%' then raise exception 'Unexpected pair registration function; review migration before applying.'; end if;
  original:=definition;
  definition:=replace(definition,'if p_partner_id is null or p_partner_id=auth.uid() or not exists(',
    'if not exists(select 1 from public.applications where event_id=e.id and student_id=p_partner_id and review_state not in (''withdrawn'',''rejected'')) then raise exception ''Your partner must register individually for this event first.'' using errcode=''22023''; end if;
    if p_partner_id is null or p_partner_id=auth.uid() or not exists(');
  if definition=original then raise exception 'Unexpected pair invitation function; review migration before applying.'; end if;
  execute definition;
  original:=pg_get_functiondef('public.find_pair_partner(uuid,uuid,text)'::regprocedure);
  definition:=replace(original,'where p.batch_id=p_batch_id',
    'where exists(select 1 from public.applications where event_id=e.id and student_id=p.id and review_state not in (''withdrawn'',''rejected'')) and p.batch_id=p_batch_id');
  if definition=original then raise exception 'Unexpected partner lookup function; review migration before applying.'; end if;
  execute definition;
end $$;

-- Add only the participant's own proposal status; never expose another team's draft.
do $$
declare definition text; original text;
begin
  original:=pg_get_functiondef('public.get_team_workspace(uuid)'::regprocedure);
  definition:=replace(original,'''registered'',exists(select 1 from public.applications where event_id=e.id and student_id=auth.uid()),',
    '''registered'',exists(select 1 from public.applications where event_id=e.id and student_id=auth.uid() and review_state not in (''withdrawn'',''rejected'')),
    ''reviewState'',(select review_state from public.applications where event_id=e.id and student_id=auth.uid()),
    ''finalTeamPublished'',e.format=''sport'' and exists(select 1 from public.participant_groups g join public.profiles p on p.batch_id=g.batch_id where g.event_id=e.id and g.state=''published'' and p.id=auth.uid()),
    ''proposed'',exists(select 1 from public.participant_groups g join public.applications a on a.event_id=g.event_id and a.id=any(g.proposed_application_ids) where g.event_id=e.id and g.state=''draft'' and a.student_id=auth.uid()),');
  if definition=original then raise exception 'Unexpected team workspace function; review migration before applying.'; end if;
  execute definition;
end $$;

notify pgrst,'reload schema';
reset lock_timeout;
reset statement_timeout;
