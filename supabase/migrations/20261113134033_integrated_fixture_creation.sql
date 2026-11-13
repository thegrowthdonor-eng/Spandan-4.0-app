set lock_timeout='5s';
set statement_timeout='60s';

-- Match scheduling and awards share the same final, active roster.
create function private.match_entrants(p_event_id uuid)
returns table(target_id uuid,target_kind text,label text,category text,batch_id uuid,roll_canonical text,batch_label text)
language sql stable security definer set search_path='' as $$
  select a.id,'application',p.full_name,p.participant_category,p.batch_id,p.roll_canonical,b.label
  from public.applications a join public.events e on e.id=a.event_id join public.profiles p on p.id=a.student_id
  left join public.batches b on b.id=p.batch_id join public.access_records ar on ar.profile_id=p.id and ar.edition_id=e.edition_id
  where e.id=p_event_id and e.registration_enabled and e.format='solo' and public.can_manage_event(e.id)
    and a.review_state='approved' and a.selection_state='selected' and ar.state='active' and ar.verified_at is not null
    and (coalesce(e.eligibility->>'division','open') not in ('boys','girls') or p.gender=case e.eligibility->>'division' when 'boys' then 'male' else 'female' end)
  union all
  select g.id,'group',g.name,'group',g.batch_id,null,b.label
  from public.participant_groups g join public.events e on e.id=g.event_id left join public.batches b on b.id=g.batch_id
  where e.id=p_event_id and e.registration_enabled and e.format in ('pair','group','sport') and public.can_manage_event(e.id) and g.state='published'
    and (select count(*) from public.group_memberships m where m.group_id=g.id and m.removed_at is null)
      between coalesce(e.group_min_size,1) and coalesce(e.group_max_size,200)
    and (e.format<>'pair' or (select count(*) from public.group_memberships m where m.group_id=g.id and m.removed_at is null)=2)
    and (e.format='pair' or exists(select 1 from public.group_memberships m join public.applications a on a.id=m.application_id where m.group_id=g.id and m.removed_at is null and a.student_id=g.captain_id))
    and not exists(select 1 from public.group_memberships m join public.applications a on a.id=m.application_id join public.profiles p on p.id=a.student_id
      left join public.access_records ar on ar.profile_id=p.id and ar.edition_id=e.edition_id
      where m.group_id=g.id and m.removed_at is null and (a.event_id<>e.id or a.review_state<>'approved' or a.selection_state<>'selected'
        or ar.state is distinct from 'active' or ar.verified_at is null or ((e.batch_restricted or e.format='sport') and p.batch_id is distinct from g.batch_id)
        or (coalesce(e.eligibility->>'division','open') in ('boys','girls') and p.gender is distinct from case e.eligibility->>'division' when 'boys' then 'male' else 'female' end)));
$$;
revoke all on function private.match_entrants(uuid) from public,anon,authenticated;

alter function public.list_result_participants(uuid) rename to list_result_participants_before_fixture_ids;
alter function public.list_result_participants_before_fixture_ids(uuid) set schema private;
revoke all on function private.list_result_participants_before_fixture_ids(uuid) from public,anon,authenticated;
create function public.list_result_participants(p_event_id uuid)
returns table(target_id uuid,target_kind text,label text,category text,batch_id uuid,roll_canonical text,batch_label text)
language plpgsql stable security definer set search_path='' as $$
begin
  if exists(select 1 from public.events where id=p_event_id and operating_method in ('live_matches','fixtures_only')) then
    return query select * from private.match_entrants(p_event_id) order by label;
  else
    return query select * from private.list_result_participants_before_fixture_ids(p_event_id);
  end if;
end $$;
revoke all on function public.list_result_participants(uuid) from public,anon;
grant execute on function public.list_result_participants(uuid) to authenticated;

alter table public.fixtures
  add column participant_a_application_id uuid references public.applications(id) deferrable initially deferred,
  add column participant_b_application_id uuid references public.applications(id) deferrable initially deferred,
  add column participant_a_group_id uuid references public.participant_groups(id) deferrable initially deferred,
  add column participant_b_group_id uuid references public.participant_groups(id) deferrable initially deferred;
create index fixtures_a_application on public.fixtures(participant_a_application_id) where participant_a_application_id is not null;
create index fixtures_b_application on public.fixtures(participant_b_application_id) where participant_b_application_id is not null;
create index fixtures_a_group on public.fixtures(participant_a_group_id) where participant_a_group_id is not null;
create index fixtures_b_group on public.fixtures(participant_b_group_id) where participant_b_group_id is not null;

-- Preserve historical labels and scores; refuse ambiguous historical identities.
do $$
declare f public.fixtures; fmt public.event_format; a uuid[]; b uuid[];
begin
  for f in select * from public.fixtures order by id loop
    select format into fmt from public.events where id=f.event_id;
    if fmt='solo' then
      select array_agg(app.id) filter(where f.participant_a_label in (p.full_name,p.full_name||' ('||ba.label||case when p.roll_canonical is null then '' else ', #'||p.roll_canonical end||')')),
        array_agg(app.id) filter(where f.participant_b_label in (p.full_name,p.full_name||' ('||ba.label||case when p.roll_canonical is null then '' else ', #'||p.roll_canonical end||')'))
      into a,b from public.applications app join public.profiles p on p.id=app.student_id left join public.batches ba on ba.id=p.batch_id where app.event_id=f.event_id;
    else
      select array_agg(g.id) filter(where g.name=f.participant_a_label),array_agg(g.id) filter(where g.name=f.participant_b_label) into a,b from public.participant_groups g where g.event_id=f.event_id;
    end if;
    if coalesce(cardinality(a),0)<>1 or coalesce(cardinality(b),0)<>1 or a[1]=b[1] then
      raise exception 'Fixture % has unresolved/ambiguous participants. Correct its identities before migrating; no fixtures have been removed.',f.id;
    end if;
    -- The previous name guard must not reinterpret historical team names during backfill.
    if fmt='solo' then update public.fixtures set participant_a_application_id=a[1],participant_b_application_id=b[1] where id=f.id;
    else update public.fixtures set participant_a_group_id=a[1],participant_b_group_id=b[1] where id=f.id; end if;
  end loop;
end $$;
alter table public.fixtures add constraint fixture_referenced_sides check(
  num_nonnulls(participant_a_application_id,participant_a_group_id)=1 and num_nonnulls(participant_b_application_id,participant_b_group_id)=1
  and (participant_a_application_id is null)=(participant_b_application_id is null)
  and coalesce(participant_a_application_id,participant_a_group_id)<>coalesce(participant_b_application_id,participant_b_group_id));
alter table public.fixtures drop constraint fixtures_check;

create or replace function public.guard_fixture_roster() returns trigger
language plpgsql security definer set search_path='' as $$
declare e public.events; candidates jsonb; side text; entrant record; reference_id uuid; reference_kind text; label text; matches integer;
begin
  if num_nonnulls(new.participant_a_application_id,new.participant_a_group_id)>1 or num_nonnulls(new.participant_b_application_id,new.participant_b_group_id)>1 then raise exception 'Choose one roster identity per side.' using errcode='22023'; end if;
  if new.reporting_at is not null and (new.starts_at is null or new.reporting_at>new.starts_at) then raise exception 'Reporting time must be before match start.' using errcode='22023'; end if;
  if tg_op='UPDATE' then
    if row(new.event_id,new.participant_a_application_id,new.participant_b_application_id,new.participant_a_group_id,new.participant_b_group_id,new.participant_a_label,new.participant_b_label)
      is not distinct from row(old.event_id,old.participant_a_application_id,old.participant_b_application_id,old.participant_a_group_id,old.participant_b_group_id,old.participant_a_label,old.participant_b_label)
      and not(old.actual_started_at is null and new.actual_started_at is not null) then return new; end if;
    if old.actual_started_at is not null then raise exception 'Started match participants cannot be replaced.' using errcode='22023'; end if;
  end if;
  select * into e from public.events where id=new.event_id for update;
  if not found or not e.registration_enabled or e.operating_method not in ('live_matches','fixtures_only') or e.state in ('draft','cancelled','completed') then raise exception 'This event is not accepting new match operations.' using errcode='22023'; end if;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into candidates from private.match_entrants(e.id) c;
  foreach side in array array['a','b'] loop
    reference_id:=case side when 'a' then coalesce(new.participant_a_application_id,new.participant_a_group_id) else coalesce(new.participant_b_application_id,new.participant_b_group_id) end;
    reference_kind:=case when (case side when 'a' then new.participant_a_application_id else new.participant_b_application_id end) is not null then 'application' else 'group' end;
    label:=case side when 'a' then new.participant_a_label else new.participant_b_label end;
    -- Legacy label edits resolve again; typed requests have blank labels until this trigger derives them.
    if tg_op='UPDATE' and label is distinct from (case side when 'a' then old.participant_a_label else old.participant_b_label end)
      and reference_id is not distinct from (case side when 'a' then coalesce(old.participant_a_application_id,old.participant_a_group_id) else coalesce(old.participant_b_application_id,old.participant_b_group_id) end) then reference_id:=null; end if;
    if reference_id is null then
      select count(*),min(c.value->>'target_id')::uuid into matches,reference_id from jsonb_array_elements(candidates) c where c.value->>'label'=label
        or (c.value->>'target_kind'='application' and (c.value->>'label')||' ('||(c.value->>'batch_label')||case when c.value->>'roll_canonical' is null then '' else ', #'||(c.value->>'roll_canonical') end||')'=label);
      if matches<>1 then raise exception 'Choose a unique, approved final-roster participant, team or pair from this event.' using errcode='22023'; end if;
      reference_kind:=case when e.format='solo' then 'application' else 'group' end;
    end if;
    select c.value->>'label' as name,c.value->>'batch_label' as batch,c.value->>'roll_canonical' as roll into entrant from jsonb_array_elements(candidates) c where c.value->>'target_id'=reference_id::text and c.value->>'target_kind'=reference_kind;
    if not found then raise exception 'This participant or roster is no longer eligible. Refresh the event roster.' using errcode='22023'; end if;
    -- Keep the snapshot within the existing 160-character label limit; full names remain on the roster.
    label:=left(case when entrant.batch is null then entrant.name else left(entrant.name,100)||' · Batch '||left(entrant.batch,25)||case when entrant.roll is null then '' else ' · Roll '||left(entrant.roll,20) end end,160);
    if side='a' then
      new.participant_a_application_id:=case when reference_kind='application' then reference_id end; new.participant_a_group_id:=case when reference_kind='group' then reference_id end; new.participant_a_label:=label;
    else
      new.participant_b_application_id:=case when reference_kind='application' then reference_id end; new.participant_b_group_id:=case when reference_kind='group' then reference_id end; new.participant_b_label:=label;
    end if;
  end loop;
  if coalesce(new.participant_a_application_id,new.participant_a_group_id)=coalesce(new.participant_b_application_id,new.participant_b_group_id) then raise exception 'Choose two different opponents.' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.guard_fixture_roster() from public,anon,authenticated;
drop trigger fixture_roster_guard on public.fixtures;
create trigger fixture_roster_guard before insert or update on public.fixtures for each row execute function public.guard_fixture_roster();

create function public.create_roster_fixture(p_event_id uuid,p_stage text,p_participant_a jsonb,p_participant_b jsonb,p_venue text default null,p_reporting_at timestamptz default null,p_starts_at timestamptz default null)
returns public.fixtures language plpgsql security definer set search_path='' as $$
declare f public.fixtures;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event.' using errcode='42501'; end if;
  if length(btrim(p_stage)) not between 1 and 100 or p_stage is null or length(p_venue)>160 or coalesce(p_participant_a->>'kind','') not in ('application','group') or coalesce(p_participant_b->>'kind','') not in ('application','group')
    or p_participant_a->>'id' is null or p_participant_b->>'id' is null then raise exception 'Choose two event-roster opponents and a round.' using errcode='22023'; end if;
  insert into public.fixtures(event_id,stage,participant_a_label,participant_b_label,participant_a_application_id,participant_b_application_id,participant_a_group_id,participant_b_group_id,venue,reporting_at,starts_at,state,created_by)
  values(p_event_id,btrim(p_stage),'','',case when p_participant_a->>'kind'='application' then (p_participant_a->>'id')::uuid end,case when p_participant_b->>'kind'='application' then (p_participant_b->>'id')::uuid end,
    case when p_participant_a->>'kind'='group' then (p_participant_a->>'id')::uuid end,case when p_participant_b->>'kind'='group' then (p_participant_b->>'id')::uuid end,
    nullif(btrim(p_venue),''),p_reporting_at,p_starts_at,case when p_starts_at is null then 'draft'::public.fixture_state else 'scheduled'::public.fixture_state end,auth.uid()) returning * into f;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'fixture.created','fixture',f.id,jsonb_build_object('event_id',p_event_id,'participant_a',p_participant_a,'participant_b',p_participant_b));
  return f;
end $$;
revoke all on function public.create_roster_fixture(uuid,text,jsonb,jsonb,text,timestamptz,timestamptz) from public,anon;
grant execute on function public.create_roster_fixture(uuid,text,jsonb,jsonb,text,timestamptz,timestamptz) to authenticated;

create function public.bulk_create_roster_fixtures(p_event_id uuid,p_fixtures jsonb)
returns setof public.fixtures language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event.' using errcode='42501'; end if;
  if jsonb_typeof(p_fixtures) is distinct from 'array' or jsonb_array_length(p_fixtures) not between 1 and 50 then raise exception 'Supply 1 to 50 fixtures.' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_fixtures) loop
    if item ? 'participantA' or item ? 'participantB' then
      return next public.create_roster_fixture(p_event_id,item->>'stage',item->'participantA',item->'participantB',item->>'venue',(item->>'reportingAt')::timestamptz,(item->>'startsAt')::timestamptz);
    else
      return next public.create_fixture(p_event_id,item->>'stage',item->>'participantALabel',item->>'participantBLabel',item->>'venue',(item->>'reportingAt')::timestamptz,(item->>'startsAt')::timestamptz);
    end if;
  end loop;
end $$;
revoke all on function public.bulk_create_roster_fixtures(uuid,jsonb) from public,anon;
grant execute on function public.bulk_create_roster_fixtures(uuid,jsonb) to authenticated;

create or replace function public.generate_fixture_reminders(p_fixture_id uuid,p_body text default null)
returns integer language plpgsql security definer set search_path='' as $$
declare f public.fixtures; affected integer;
begin
  select * into f from public.fixtures where id=p_fixture_id;
  if not found or auth.uid() is null or not public.can_manage_event(f.event_id) then raise exception 'Not authorised for this fixture.' using errcode='42501'; end if;
  if f.starts_at is null then raise exception 'Fixture must have a start time.' using errcode='22023'; end if;
  insert into public.reminders(profile_id,event_id,source_version,title,body,due_at)
  select distinct a.student_id,f.event_id,'fixture:'||f.id||':v'||f.schedule_version,f.stage||' — schedule update',coalesce(nullif(btrim(p_body),''),'Check the latest match time.'),coalesce(f.reporting_at,f.starts_at)-interval '1 hour'
  from public.applications a where a.event_id=f.event_id and a.review_state='approved' and a.selection_state='selected'
    and (a.id in(f.participant_a_application_id,f.participant_b_application_id) or exists(select 1 from public.group_memberships m where m.application_id=a.id and m.group_id in(f.participant_a_group_id,f.participant_b_group_id) and m.removed_at is null))
  on conflict(profile_id,source_version) do update set title=excluded.title,body=excluded.body,due_at=excluded.due_at,dismissed_at=null;
  get diagnostics affected=row_count;
  return affected;
end $$;

-- Captain replacement must obey the same cross-team exclusions as initial appointment.
do $$ declare original text; definition text; begin
  original:=pg_get_functiondef('public.manage_team_proposal(uuid,uuid,text,jsonb)'::regprocedure);
  definition:=replace(original,'if g.state=''published'' and not(leader.id=any(g.proposed_application_ids))',
    'if exists(select 1 from public.participant_groups where event_id=e.id and id<>g.id and captain_id=leader.student_id and state<>''disbanded'') or exists(select 1 from public.group_memberships where application_id=leader.id and group_id<>g.id and removed_at is null) then raise exception ''This participant already leads or belongs to another team.'' using errcode=''22023''; end if;
      if g.state=''published'' and not(leader.id=any(g.proposed_application_ids))');
  if original=definition then raise exception 'Captain replacement function changed; review migration.'; end if;
  execute definition;
  original:=pg_get_functiondef('public.apply_to_event(uuid,uuid,jsonb)'::regprocedure);
  definition:=replace(original,'if required_gender is not null and p.gender is distinct from required_gender then',
    'if required_gender is not null and p.gender is null then raise exception ''Gender details incomplete. Contact the registration desk.'' using errcode=''42501'',detail=''gender_missing''; end if;
  if required_gender is not null and p.gender is distinct from required_gender then');
  if original=definition then raise exception 'Registration gender validation changed; review migration.'; end if;
  execute definition;
  original:=pg_get_functiondef('public.publish_unified_results(uuid,jsonb,text,text,text,integer)'::regprocedure);
  definition:=replace(original,'raw_value:=nullif(item->>''finalValue'','''');',
    'if e.operating_method in (''live_matches'',''fixtures_only'') and not exists(select 1 from private.match_entrants(e.id) c where (c.target_kind=''application'' and c.target_id=nullif(item->>''applicationId'','''')::uuid) or (c.target_kind=''group'' and c.target_id=nullif(item->>''groupId'','''')::uuid)) then raise exception ''Choose an eligible final-roster winner from this event.'' using errcode=''22023''; end if;
    raw_value:=nullif(item->>''finalValue'','''');');
  if original=definition then raise exception 'Result validation changed; review migration.'; end if;
  execute definition;
end $$;

notify pgrst,'reload schema';
reset lock_timeout;
reset statement_timeout;
