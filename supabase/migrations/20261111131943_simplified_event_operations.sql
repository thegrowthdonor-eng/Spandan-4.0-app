-- Additive simplification: legacy sessions/scores remain intact; new operations use saved event policy.
alter table public.events add column operating_method text not null default 'results_only'
  check(operating_method in ('live_matches','fixtures_only','results_only','voting','programme'));
alter table public.events add column entry_format text not null default 'image' check(entry_format in ('image','text'));
alter table public.events add column result_unit text check(result_unit in ('seconds','minutes','metres','count','marks'));

-- Reviewed mapping is documented in docs/SIMPLIFIED-OPERATIONS.md; never infer again after this backfill.
update public.events e set operating_method=case
  when exists(select 1 from public.competition_settings c where c.event_id=e.id and c.result_mode='public_vote') then 'voting'
  when not e.registration_enabled or e.title ~* 'dance|singing|fashion|natak|theatre|mushaira|poetry slam|stage performance' then 'programme'
  when e.title ~* 'chess|carrom' then 'fixtures_only'
  when e.title ~* 'photograph|rangoli' and not exists(select 1 from public.result_publications where event_id=e.id) then 'voting'
  when e.title ~* 'football|cricket|badminton|volleyball|tennis|kabaddi|kho.?kho|basketball|handball|throwball|tug.?of.?war' then 'live_matches'
  else 'results_only' end,
  result_unit=case when e.title ~* 'sprint|race|relay|hurdles|marathon|swimming|cycling' then 'seconds'
    when e.title ~* 'shot.?put|discus|javelin|jump' then 'metres' when e.title ~* 'push.?up|skipping' then 'count' else null end;
update public.events e set score_template='set_based'
where e.operating_method='live_matches' and e.title ~* 'tennis|volleyball|throwball'
  and not exists(select 1 from public.score_snapshots s join public.fixtures f on f.id=s.fixture_id where f.event_id=e.id);

create function private.check_event_operations()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not new.registration_enabled then new.operating_method:='programme'; end if;
  if tg_op='UPDATE' and (new.operating_method,new.entry_format,new.result_unit) is distinct from (old.operating_method,old.entry_format,old.result_unit) then
    if exists(select 1 from public.fixtures where event_id=old.id) or exists(select 1 from public.competition_sessions where event_id=old.id)
      or exists(select 1 from public.competition_entries where event_id=old.id) or exists(select 1 from public.polls where event_id=old.id and competition)
      or exists(select 1 from public.result_publications where event_id=old.id) then
      raise exception 'Event method, entry format and value unit are locked after dependent records exist' using errcode='55000';
    end if;
    if auth.uid() is not null and not public.can_edit_event_definition(old.id) then raise exception 'Event editing permission required' using errcode='42501'; end if;
  end if;
  return new;
end $$;
revoke all on function private.check_event_operations() from public,anon,authenticated;
create trigger event_operations_policy before insert or update on public.events for each row execute function private.check_event_operations();

create function private.initialize_event_operations()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.competition_settings(event_id,schedule_mode,result_mode,attempts)
  values(new.id,case when new.operating_method='voting' then 'submission' when new.operating_method='programme' then 'information' when new.operating_method in ('live_matches','fixtures_only') then 'match' else 'session' end,
    case when new.operating_method='voting' then 'public_vote' when new.operating_method='programme' then 'none' when new.operating_method in ('live_matches','fixtures_only') then 'sport_score' else 'faculty_places' end,1)
  on conflict(event_id) do nothing;
  if tg_op='UPDATE' and new.operating_method is distinct from old.operating_method then
    update public.competition_settings set schedule_mode=case when new.operating_method='voting' then 'submission' when new.operating_method='programme' then 'information' when new.operating_method in ('live_matches','fixtures_only') then 'match' else 'session' end,
      result_mode=case when new.operating_method='voting' then 'public_vote' when new.operating_method='programme' then 'none' when new.operating_method in ('live_matches','fixtures_only') then 'sport_score' else 'faculty_places' end,version=version+1 where event_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.initialize_event_operations() from public,anon,authenticated;
create trigger event_operations_setup after insert or update of operating_method on public.events for each row execute function private.initialize_event_operations();
insert into public.competition_settings(event_id,schedule_mode,result_mode,attempts)
select id,case when operating_method='voting' then 'submission' when operating_method='programme' then 'information' when operating_method in ('live_matches','fixtures_only') then 'match' else 'session' end,
  case when operating_method='voting' then 'public_vote' when operating_method='programme' then 'none' when operating_method in ('live_matches','fixtures_only') then 'sport_score' else 'faculty_places' end,1 from public.events on conflict(event_id) do nothing;

alter function public.save_management_event(uuid,uuid,jsonb) set schema private;
revoke all on function private.save_management_event(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.save_management_event(p_event_id uuid,p_edition_id uuid,p_details jsonb)
returns public.events language plpgsql security definer set search_path=public as $$
declare ev public.events; method text; entry_kind text; unit text; begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_event_id is not null then select * into ev from public.events where id=p_event_id for update; end if;
  method:=coalesce(p_details->>'operatingMethod',ev.operating_method,case when coalesce((p_details->>'registrationEnabled')::boolean,true) then 'results_only' else 'programme' end);
  entry_kind:=coalesce(p_details->>'entryFormat',ev.entry_format,'image'); unit:=case when p_details ? 'resultUnit' then p_details->>'resultUnit' else ev.result_unit end;
  if method not in ('live_matches','fixtures_only','results_only','voting','programme') or entry_kind not in ('image','text') or (unit is not null and unit not in ('seconds','minutes','metres','count','marks')) then raise exception 'Choose valid event operations' using errcode='22023'; end if;
  select * into ev from private.save_management_event(p_event_id,p_edition_id,p_details);
  update public.events set operating_method=method,entry_format=entry_kind,result_unit=unit where id=ev.id returning * into ev;
  return ev;
end $$;
revoke all on function public.save_management_event(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_management_event(uuid,uuid,jsonb) to authenticated,service_role;

alter function public.list_admin_event_editor_data() set schema private;
revoke all on function private.list_admin_event_editor_data() from public,anon,authenticated;
create function public.list_admin_event_editor_data()
returns setof jsonb language sql stable security definer set search_path=public as $$
  select to_jsonb(d)||jsonb_build_object('operating_method',e.operating_method,'entry_format',e.entry_format,'result_unit',e.result_unit,
    'operations_locked',exists(select 1 from public.fixtures where event_id=e.id) or exists(select 1 from public.competition_sessions where event_id=e.id) or exists(select 1 from public.competition_entries where event_id=e.id) or exists(select 1 from public.result_publications where event_id=e.id))
  from private.list_admin_event_editor_data() d join public.events e on e.id=d.event_id;
$$;
revoke all on function public.list_admin_event_editor_data() from public,anon;
grant execute on function public.list_admin_event_editor_data() to authenticated;

create function private.fixture_operation_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare method text; begin
  select operating_method into method from public.events where id=new.event_id;
  if tg_op='INSERT' and method not in ('live_matches','fixtures_only') then raise exception 'This event does not use match fixtures' using errcode='22023'; end if;
  if method<>'live_matches' and ((tg_op='INSERT' and new.actual_started_at is not null) or (tg_op='UPDATE' and new.actual_started_at is distinct from old.actual_started_at) or new.state='ongoing') then
    raise exception 'This event has no live scoring controls' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function private.fixture_operation_guard() from public,anon,authenticated;
create trigger fixture_operation_policy before insert or update on public.fixtures for each row execute function private.fixture_operation_guard();
create function private.score_operation_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.fixtures f join public.events e on e.id=f.event_id where f.id=new.fixture_id and e.operating_method='live_matches') then raise exception 'Live scoring is unavailable for this event' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function private.score_operation_guard() from public,anon,authenticated;
create trigger score_operation_policy before insert or update on public.score_snapshots for each row execute function private.score_operation_guard();

do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.prepare_fixture_offline(uuid,uuid)'::regprocedure);
  definition:=replace(definition,'select * into event from public.events where id = fixture.event_id;',
    'select * into event from public.events where id = fixture.event_id;
    if event.operating_method<>''live_matches'' then raise exception ''Live scoring is unavailable for this event'' using errcode=''22023''; end if;');
  execute definition;
  definition:=pg_get_functiondef('public.competition_workspace(uuid)'::regprocedure);
  definition:=replace(definition,'''registration_enabled'',e.registration_enabled', '''registration_enabled'',e.registration_enabled,''operating_method'',e.operating_method,''entry_format'',e.entry_format,''result_unit'',e.result_unit');
  execute definition;
  definition:=pg_get_functiondef('public.get_management_summary()'::regprocedure);
  definition:=replace(definition,'''registration_enabled'',e.registration_enabled', '''registration_enabled'',e.registration_enabled,''operating_method'',e.operating_method');
  execute definition;
  definition:=pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure);
  definition:=replace(definition,'  if p_action not in (''entry'')',
    '  if p_action in (''sessions'',''session_roster'',''session_schedule'',''session_state'',''session_results'') then raise exception ''Use event information and final results; advanced sessions are archived'' using errcode=''22023''; end if;
  if e.operating_method<>''voting'' then raise exception ''Public voting is not enabled for this event'' using errcode=''22023''; end if;
  if p_action=''settings'' and (p_data->>''result_mode''<>''public_vote'' or p_data->>''schedule_mode'' not in (''submission'',''session'')) then raise exception ''Use the saved event method'' using errcode=''22023''; end if;
  if p_action not in (''entry'')');
  execute definition;
  definition:=pg_get_functiondef('public.public_competition(uuid)'::regprocedure);
  definition:=replace(definition,'''title'',e.title,', '''title'',e.title,''operatingMethod'',e.operating_method,''entryFormat'',e.entry_format,');
  definition:=replace(definition,'s.event_id=e.id and s.state<>''draft''','s.event_id=e.id and s.state<>''draft'' and false');
  execute definition;
end $migration$;

create or replace function public.competition_entry_media_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare m public.media_assets; kind text; begin
  select entry_format into kind from public.events where id=new.event_id;
  if new.state in ('submitted','approved') and kind='text' and length(btrim(new.description))=0 then raise exception 'Enter the written work before submitting' using errcode='22023'; end if;
  if new.media_id is not null then
    select * into m from public.media_assets where id=new.media_id;
    if m.event_id is distinct from new.event_id or m.purpose<>'competition' or m.state not in ('validated','public') or (auth.uid() is not null and m.owner_id<>auth.uid() and not public.can_manage_event(new.event_id) and not exists(select 1 from public.competition_entries existing where existing.event_id=new.event_id and existing.media_id=new.media_id and existing.application_id is not distinct from new.application_id and existing.group_id is not distinct from new.group_id)) then raise exception 'Choose a validated image belonging to this entrant or assigned staff' using errcode='42501'; end if;
  elsif new.state in ('submitted','approved') and kind='image' then raise exception 'Upload a validated entry image before submission' using errcode='22023'; end if;
  if new.public_media_url is not null and (new.media_id is null or m.state<>'public' or new.public_media_url is distinct from m.public_url) then raise exception 'Untrusted public media URL' using errcode='42501'; end if;
  return new;
end $$;

do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.competition_round_ready()'::regprocedure);
  definition:=replace(definition,'n.state=''approved'' and (n.public_media_url', 'n.state=''approved'' and (n.media_id is not null or (select entry_format from public.events where id=new.event_id)=''image'') and (n.public_media_url');
  execute definition;
end $migration$;

alter table public.result_positions add column final_value numeric(15,3) check(final_value>=0);
alter table public.result_positions add column value_unit text check(value_unit in ('seconds','minutes','metres','count','marks'));
alter function public.publish_unified_results(uuid,jsonb,text,text,text) set schema private;
revoke all on function private.publish_unified_results(uuid,jsonb,text,text,text) from public,anon,authenticated;
create function public.publish_unified_results(p_event_id uuid,p_positions jsonb,p_reason text default null,p_podium_photo_url text default null,p_podium_caption text default null,p_expected_version integer default 0)
returns public.result_publications language plpgsql security definer set search_path=public as $$
declare e public.events; latest integer; pub public.result_publications; item jsonb; raw_value text; begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode='42501'; end if;
  select * into e from public.events where id=p_event_id for update;
  if e.operating_method='programme' then raise exception 'This event uses information and gallery updates, without official results' using errcode='22023'; end if;
  select coalesce(max(version),0) into latest from public.result_publications where event_id=e.id;
  if p_expected_version is distinct from latest then raise exception 'Results changed. Reload before publishing your correction' using errcode='PT409'; end if;
  if jsonb_typeof(p_positions) is distinct from 'array' or jsonb_array_length(p_positions)<1 then raise exception 'Enter the award positions' using errcode='22023'; end if;
  if (select count(distinct x->>'placing') from jsonb_array_elements(p_positions) x)<>jsonb_array_length(p_positions) then raise exception 'Each position must be distinct' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_positions) loop
    if not exists(select 1 from public.point_rules where event_id=e.id and "placing"=(item->>'placing')::integer) then raise exception 'Configure points for each award position first' using errcode='22023'; end if;
    raw_value:=nullif(item->>'finalValue','');
    if raw_value is not null and (raw_value !~ '^[0-9]{1,12}(\.[0-9]{1,3})?$' or e.result_unit is null or e.operating_method='voting') then raise exception 'Enter a valid final value in the event unit' using errcode='22023'; end if;
    if e.result_unit='count' and raw_value is not null and raw_value::numeric<>trunc(raw_value::numeric) then raise exception 'Count must be a whole number' using errcode='22023'; end if;
  end loop;
  select * into pub from private.publish_unified_results(e.id,p_positions,p_reason,p_podium_photo_url,p_podium_caption);
  for item in select value from jsonb_array_elements(p_positions) loop
    update public.result_positions set final_value=nullif(item->>'finalValue','')::numeric,value_unit=case when nullif(item->>'finalValue','') is not null then e.result_unit end
    where publication_id=pub.id and "placing"=(item->>'placing')::integer;
  end loop;
  return pub;
end $$;
revoke all on function public.publish_unified_results(uuid,jsonb,text,text,text,integer) from public,anon;
grant execute on function public.publish_unified_results(uuid,jsonb,text,text,text,integer) to authenticated;

create or replace function public.guard_competition_publication()
returns trigger language plpgsql security definer set search_path=public as $$
declare eid uuid; method text; cfg public.competition_settings; begin
  select p.event_id,e.operating_method into eid,method from public.result_publications p join public.events e on e.id=p.event_id where p.id=new.publication_id;
  select * into cfg from public.competition_settings where event_id=eid;
  if method='programme' then raise exception 'This event has no official results' using errcode='22023'; end if;
  if method='voting' and (not coalesce(cfg.verified,false) or not exists(select 1 from public.competition_placements r join public.competition_entries n on n.id=r.entry_id where r.event_id=eid and r."placing"=new."placing" and (n.application_id=new.application_id or n.group_id=new.group_id))) then raise exception 'Publish only verified vote-ranked winners after resolving award ties' using errcode='22023'; end if;
  return new;
end $$;

do $migration$ declare definition text; fn text; begin
  foreach fn in array array['public.unified_event_results(uuid)','public.get_published_event_results()'] loop
    definition:=pg_get_functiondef(fn::regprocedure);
    definition:=replace(definition,'''note'',pos.note','''note'',pos.note,''final_value'',pos.final_value,''value_unit'',pos.value_unit');
    execute definition;
  end loop;
end $migration$;
create or replace function public.list_event_results(p_event_id uuid)
returns table(publication_id uuid,version integer,state text,reason text,published_by_name text,published_at timestamptz,podium_photo_url text,podium_caption text,positions jsonb)
language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode='42501'; end if;
  return query select rp.id,rp.version,rp.state::text,rp.reason,p.full_name,rp.published_at,rp.podium_photo_url,rp.podium_caption,
    coalesce((select jsonb_agg(jsonb_build_object('placing',pos."placing",'batch_id',pos.batch_id,'batch_label',b.label,'winner_name',pos.winner_name,'winner_roll',pos.winner_roll,'participant_category',pos.participant_category,'application_id',pos.application_id,'group_id',pos.group_id,'points',pos.awarded_points,'note',pos.note,'final_value',pos.final_value,'value_unit',pos.value_unit) order by pos."placing") from public.result_positions pos left join public.batches b on b.id=pos.batch_id where pos.publication_id=rp.id),'[]')
    from public.result_publications rp left join public.profiles p on p.id=rp.published_by where rp.event_id=p_event_id order by rp.version desc;
end $$;

-- Archive advanced session projections; preserve their stored records and history.
create or replace function public.public_competition_live()
returns jsonb language sql stable security definer set search_path=public as $$ select '[]'::jsonb; $$;
create or replace function public.public_competition_schedule()
returns table(id uuid,event_id uuid,event_title text,edition_id uuid,title text,venue text,starts_at timestamptz,reporting_at timestamptz,ends_at timestamptz,state text,schedule_entry_id uuid)
language sql stable security definer set search_path=public as $$
  select s.id,s.event_id,e.title,e.edition_id,s.title,s.venue,s.starts_at,s.reporting_at,s.ends_at,s.state,s.schedule_entry_id from public.competition_sessions s join public.events e on e.id=s.event_id where false;
$$;
