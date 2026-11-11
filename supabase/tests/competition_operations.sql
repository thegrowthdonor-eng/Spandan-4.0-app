-- Isolated QA/local only. All created event, result and fixture data rolls back.
begin;
do $test$
declare actor uuid; source_event uuid; eid uuid:=gen_random_uuid(); board uuid:=gen_random_uuid(); stage uuid:=gen_random_uuid(); sport uuid:=gen_random_uuid(); empty_event uuid:=gen_random_uuid(); app uuid; pub public.result_publications; fid uuid:=gen_random_uuid(); result jsonb;
begin
  select profile_id into actor from public.staff_assignments where role='main_admin' and revoked_at is null limit 1;
  assert actor is not null,'A fictional QA main admin is required';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  select a.event_id into source_event from public.applications a join public.events e on e.id=a.event_id where e.format='solo' and a.review_state='approved' limit 1;
  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',eid,'slug','qa-results-'||eid,'title','QA manual results','state','open','operating_method','results_only','result_unit','seconds'))).* from public.events e where id=source_event;
  insert into public.applications select (jsonb_populate_record(null::public.applications,to_jsonb(a)||jsonb_build_object('id',gen_random_uuid(),'event_id',eid,'idempotency_key',gen_random_uuid()))).* from public.applications a where event_id=source_event and review_state='approved' limit 1 returning id into app;
  perform public.set_event_point_rules(eid,'[{"placing":1,"points":10}]');
  select * into pub from public.publish_unified_results(eid,jsonb_build_array(jsonb_build_object('placing',1,'applicationId',app,'finalValue','12.450')),null,null,null,0);
  assert (select final_value=12.450 and value_unit='seconds' from public.result_positions where publication_id=pub.id),'Manual value not stored';
  assert not exists(select 1 from public.competition_sessions where event_id=eid),'Manual results created an unwanted session';
  result:=public.unified_event_results(eid);
  assert result->0->'positions'->0->>'value_unit'='seconds','Public value unit missing';
  assert (select positions->0->>'application_id'=app::text from public.list_event_results(eid) limit 1),'Correction lost winner identity';
  begin perform public.publish_unified_results(eid,jsonb_build_array(jsonb_build_object('placing',1,'applicationId',app,'finalValue','12.3')),'Stale',null,null,0);raise exception 'Stale publication accepted';exception when sqlstate 'PT409' then null;end;
  begin perform public.publish_unified_results(eid,jsonb_build_array(jsonb_build_object('placing',1,'applicationId',app,'finalValue','-1')),'Invalid',null,null,1);raise exception 'Negative final value accepted';exception when sqlstate '22023' then null;end;
  begin perform public.publish_unified_results(eid,jsonb_build_array(jsonb_build_object('placing',1,'applicationId',app)),null,null,null,1);raise exception 'Correction accepted without reason';exception when sqlstate '22023' then null;end;
  perform public.publish_unified_results(eid,jsonb_build_array(jsonb_build_object('placing',1,'applicationId',app,'finalValue','12.400')),'Official correction',null,null,1);
  assert (select count(*)=2 from public.result_publications where event_id=eid),'Correction history missing';
  begin perform public.competition_command(eid,'sessions','{"sessions":[]}');raise exception 'Advanced session API remained available';exception when sqlstate '22023' then null;end;
  begin insert into public.fixtures(event_id,stage,participant_a_label,participant_b_label) values(eid,'Invalid','A','B');raise exception 'Manual event accepted fixtures';exception when sqlstate '22023' then null;end;
  begin update public.events set operating_method='voting' where id=eid;raise exception 'Published operation method changed';exception when sqlstate '55000' then null;end;

  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',stage,'slug','qa-stage-'||stage,'title','QA stage performance','operating_method','programme','result_unit',null))).* from public.events e where id=source_event;
  begin perform public.publish_unified_results(stage,'[{"placing":1}]');raise exception 'Stage result published';exception when sqlstate '22023' then null;end;
  assert (select registration_enabled from public.events where id=stage),'Stage registration was disabled';

  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',board,'slug','qa-board-'||board,'title','QA chess pairings','state','open','operating_method','fixtures_only'))).* from public.events e where id=source_event;
  insert into public.fixtures(id,event_id,stage,participant_a_label,participant_b_label,starts_at) values(fid,board,'Round 1','A','B',now());
  begin perform public.start_fixture_for_scoring(fid,gen_random_uuid());raise exception 'Board match started scoring';exception when sqlstate '22023' then null;end;
  assert (select actual_started_at is null from public.fixtures where id=fid),'Board match was started';
  assert not exists(select 1 from public.score_snapshots where fixture_id=fid),'Board match got a score snapshot';

  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',sport,'slug','qa-sport-'||sport,'title','QA football scoring','state','open','score_template','football','operating_method','live_matches'))).* from public.events e where id=source_event;
  fid:=gen_random_uuid();
  insert into public.fixtures(id,event_id,stage,participant_a_label,participant_b_label,starts_at) values(fid,sport,'Atomic start','A','B',now());
  insert into public.fixture_score_leases(fixture_id,device_id,holder_id,expires_at) values(fid,gen_random_uuid(),actor,now()+interval '1 day');
  begin perform public.start_fixture_for_scoring(fid,gen_random_uuid());raise exception 'Conflicting device started a match';exception when sqlstate 'PT409' then null;end;
  assert (select actual_started_at is null from public.fixtures where id=fid),'Failed preparation left match started';
  assert not exists(select 1 from public.score_snapshots where fixture_id=fid),'Failed preparation left a snapshot';
  assert not has_function_privilege('authenticated','public.start_fixture(uuid)','EXECUTE'),'Non-atomic start is exposed';
  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',empty_event,'slug','qa-empty-'||empty_event,'title','QA empty draft','state','draft','operating_method','results_only'))).* from public.events e where id=source_event;
  assert exists(select 1 from public.competition_settings where event_id=empty_event),'New event settings were not initialized';
  delete from public.events where id=empty_event;
  assert not exists(select 1 from public.competition_settings where event_id=empty_event),'Empty draft deletion left settings behind';
  perform set_config('request.jwt.claims','{}',true);
  begin perform public.publish_unified_results(eid,'[{"placing":1}]');raise exception 'Unauthorised result published';exception when sqlstate '42501' then null;end;
end $test$;
set local role anon;
do $test$ begin
  begin perform vote_count from public.poll_options limit 1;raise exception 'Hidden counters readable';exception when insufficient_privilege then null;end;
  begin perform * from private.competition_vote_grants limit 1;raise exception 'Voting grants readable';exception when insufficient_privilege then null;end;
  begin perform * from public.media_assets limit 1;raise exception 'Private media readable';exception when insufficient_privilege then null;end;
end $test$;
rollback;
