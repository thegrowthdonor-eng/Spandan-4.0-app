-- Run only on isolated QA/local Postgres. Every fixture and mutation rolls back.
begin;
do $test$
declare actor uuid; eid uuid:=gen_random_uuid(); source_event uuid; app uuid; sid uuid; rowid uuid; result jsonb; before_version integer; match_event uuid:=gen_random_uuid(); fid uuid:=gen_random_uuid();
begin
  select profile_id into actor from public.staff_assignments where role='main_admin' and revoked_at is null limit 1;
  if actor is null then raise exception 'QA requires a main admin fixture'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  select event_id into source_event from public.applications where review_state='approved' and event_id in(select id from public.events where format='solo') limit 1;
  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',eid,'slug','qa-competition-'||replace(eid::text,'-',''),'title','QA competition '||eid,'state','open','registration_enabled',true))).* from public.events e where id=source_event;
  insert into public.applications select (jsonb_populate_record(null::public.applications,to_jsonb(a)||jsonb_build_object('id',gen_random_uuid(),'event_id',eid,'idempotency_key',gen_random_uuid()))).* from public.applications a where event_id=source_event and review_state='approved' limit 3;
  select id into app from public.applications where event_id=eid limit 1;
  if app is null then raise exception 'QA requires approved solo entrants'; end if;
  perform public.competition_command(eid,'settings','{"schedule_mode":"heat","result_mode":"time","attempts":1,"submission_closes_at":null,"version":0}');
  result:=public.competition_workspace(eid);
  assert result->'settings'->>'schedule_mode'='heat','Schedule settings did not persist';
  perform public.competition_command(eid,'sessions',jsonb_build_object('sessions',jsonb_build_array(jsonb_build_object('title','QA final','venue','QA track','starts_at',now(),'is_final',true,'entrants',jsonb_build_array(jsonb_build_object('application_id',app,'group_id',null,'position',1))))));
  select id,version into sid,before_version from public.competition_sessions where event_id=eid;
  begin
    perform public.competition_command(eid,'session_state',jsonb_build_object('session_id',sid,'version',before_version,'state','live'));
    raise exception 'Unpublished draft started';
  exception when sqlstate '22023' then null; end;
  perform public.competition_command(eid,'session_state',jsonb_build_object('session_id',sid,'version',before_version,'state','scheduled'));
  begin
    perform public.competition_command(eid,'session_state',jsonb_build_object('session_id',sid,'version',before_version,'state','live'));
    raise exception 'Stale version accepted';
  exception when sqlstate 'PT409' then null; end;
  select version into before_version from public.competition_sessions where id=sid;
  perform public.competition_command(eid,'session_state',jsonb_build_object('session_id',sid,'version',before_version,'state','live'));
  select id into rowid from public.competition_session_entrants where session_id=sid;
  select version into before_version from public.competition_sessions where id=sid;
  begin
    perform public.competition_command(eid,'session_results',jsonb_build_object('session_id',sid,'version',before_version,'results',jsonb_build_array(jsonb_build_object('id',rowid,'status','valid','attempts',jsonb_build_array(1.5),'placing',1))));
    raise exception 'Fractional integer units accepted';
  exception when sqlstate '22023' then null; end;
  perform public.competition_command(eid,'session_results',jsonb_build_object('session_id',sid,'version',before_version,'results',jsonb_build_array(jsonb_build_object('id',rowid,'status','valid','attempts',jsonb_build_array(12500),'placing',1))));
  select change_summary into result from public.audit_log where object_id=eid and action='competition.session_results' order by created_at desc limit 1;
  assert result->'before'->'entrants'->0->'attempts'='[]'::jsonb,'Previous measurements were not retained';
  assert result->'after'->'entrants'->0->'attempts'='[12500]'::jsonb,'Saved measurements were not retained';
  assert jsonb_typeof(public.competition_history(eid))='array','Staff history unavailable';
  assert public.competition_history_detail(gen_random_uuid(),(select id from public.audit_log where object_id=eid limit 1)) is null,'Cross-event audit details leaked';
  select version into before_version from public.competition_sessions where id=sid;
  perform public.competition_command(eid,'session_state',jsonb_build_object('session_id',sid,'version',before_version,'state','completed'));
  assert (select attempts='[12500]'::jsonb and "placing"=1 from public.competition_session_entrants where id=rowid),'Confirmed integer result missing';
  begin
    insert into public.fixtures(event_id,stage,participant_a_label,participant_b_label,starts_at) values(eid,'Invalid match','A','B',now());
    raise exception 'Non-match event accepted a fabricated match';
  exception when sqlstate '22023' then null;end;
  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',match_event,'slug','qa-atomic-'||replace(match_event::text,'-',''),'title','QA atomic '||match_event,'state','open','score_template','football'))).* from public.events e where id=source_event;
  insert into public.fixtures(id,event_id,stage,participant_a_label,participant_b_label,starts_at) values(fid,match_event,'Atomic rollback','A','B',now());
  insert into public.fixture_score_leases(fixture_id,device_id,holder_id,expires_at) values(fid,gen_random_uuid(),actor,now()+interval '1 day');
  begin
    perform public.start_fixture_for_scoring(fid,gen_random_uuid());
    raise exception 'Conflicting device started a match';
  exception when sqlstate 'PT409' then null; end;
  assert (select actual_started_at is null from public.fixtures where id=fid),'Preparation failure left match started';
  assert not exists(select 1 from public.score_snapshots where fixture_id=fid),'Preparation failure left an initial score';
  assert not has_function_privilege('authenticated','public.start_fixture(uuid)','EXECUTE'),'Non-atomic start is still exposed to end-user sessions';
  begin
    perform public.competition_command(eid,'settings','{"schedule_mode":"match","result_mode":"sport_score","attempts":1,"submission_closes_at":null,"version":1}');
    raise exception 'Started event was reconfigured';
  exception when sqlstate '22023' then null; end;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.competition_command(eid,'verify_votes','{}');
    raise exception 'Unauthenticated mutation accepted';
  exception when sqlstate '28000' then null; end;
  result:=public.public_competition(eid);
  assert result->'sessions'->0->>'state'='completed','Public session absent';
  assert not (result::text like '%submitted_by%'),'Private identity leaked';
end $test$;
set local role anon;
do $test$ begin
  begin perform vote_count from public.poll_options limit 1;raise exception 'Hidden counters readable';exception when insufficient_privilege then null;end;
  begin perform * from private.competition_vote_grants limit 1;raise exception 'Voting grants readable';exception when insufficient_privilege then null;end;
  begin perform * from public.media_assets limit 1;raise exception 'Private media readable';exception when insufficient_privilege then null;end;
end $test$;
rollback;
