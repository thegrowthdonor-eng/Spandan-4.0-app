-- Included inside the participation acceptance transaction by the isolated runner.
do $$ begin
  if current_setting('spandan.isolated_tests',true) is distinct from 'on' or to_regclass('pg_temp.participation_test_ids') is null then raise exception 'Participation fixtures in an isolated database are required'; end if;
end $$;
insert into participation_test_ids(name) values('outsider2');
insert into auth.users(id,email) values(pg_temp.pid('outsider2'),'outsider2@participation.invalid');
insert into auth.sessions(id,user_id) values(pg_temp.pid('outsider2'),pg_temp.pid('outsider2'));
insert into public.profiles(id,full_name,batch_id,roll_canonical,phone_e164,fest_id,gender)
values(pg_temp.pid('outsider2'),'Second Batch Player',pg_temp.pid('other_batch'),'90','+919700009999','SPD-FIXTURE90','male');
insert into public.access_records(edition_id,profile_id,state,verified_at) values(pg_temp.pid('edition'),pg_temp.pid('outsider2'),'active',now());
select pg_temp.pclaim('admin');
update public.events set operating_method='live_matches',score_template='football',roster_lock_at=null where id=pg_temp.pid('sport');
update public.events set operating_method='fixtures_only' where id=pg_temp.pid('solo');

do $$
declare app public.applications; g jsonb; first_team uuid; second_team uuid; draft_team jsonb; f public.fixtures; solo_fixture public.fixtures;
  captain_app uuid; member_app uuid; reserve_app uuid; before_count bigint; checkpoint public.score_snapshots; pub public.result_publications; count_sent integer;
begin
  update public.profiles set gender=null where id=pg_temp.pid('unregistered');
  perform pg_temp.pclaim('unregistered');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('sport'),'{"slot":"A"}'),'42501','gender_missing');
  update public.profiles set gender='male' where id=pg_temp.pid('unregistered');
  perform public.apply_to_event(pg_temp.pid('sport'),gen_random_uuid(),'{"slot":"A"}');
  perform pg_temp.pclaim('outsider2');
  app:=public.apply_to_event(pg_temp.pid('sport'),gen_random_uuid(),'{"slot":"A"}');
  perform pg_temp.pclaim('admin');
  perform public.review_application(app.id,'approved',null);
  select id into first_team from public.participant_groups where event_id=pg_temp.pid('sport') and batch_id=pg_temp.pid('batch') and state='published';
  g:=public.manage_team_proposal(pg_temp.pid('sport'),null,'appoint',jsonb_build_object('leaderApplicationId',(select id from public.applications where event_id=pg_temp.pid('sport') and student_id=pg_temp.pid('outsider')),'batchId',pg_temp.pid('other_batch')));
  second_team:=(g->>'id')::uuid;
  perform pg_temp.pclaim('outsider');
  g:=public.manage_team_proposal(pg_temp.pid('sport'),second_team,'save',jsonb_build_object('version',0,'name','2023 Football','applicationIds',(select jsonb_agg(id) from public.applications where event_id=pg_temp.pid('sport') and student_id in(pg_temp.pid('outsider'),pg_temp.pid('outsider2')))));
  g:=public.manage_team_proposal(pg_temp.pid('sport'),second_team,'submit',jsonb_build_object('version',g->'roster_version'));
  perform pg_temp.pclaim('admin');
  g:=public.manage_team_proposal(pg_temp.pid('sport'),second_team,'publish',jsonb_build_object('version',g->'roster_version'));
  perform pg_temp.check_true((select count(*)=2 from public.list_result_participants(pg_temp.pid('sport'))),'Match/result roster disagrees with published teams');
  f:=public.create_roster_fixture(pg_temp.pid('sport'),'Final',jsonb_build_object('kind','group','id',first_team),jsonb_build_object('kind','group','id',second_team),'Ground',now()-interval '15 minutes',now());
  perform pg_temp.check_true(f.participant_a_group_id=first_team and f.participant_b_group_id=second_team and f.participant_a_label like '%2023' and f.participant_b_label like '%2024','Same-name teams lost their distinct identities or batch display');
  perform pg_temp.denied(format('select public.create_fixture(%L,%L,%L,%L)',pg_temp.pid('sport'),'Legacy','2023 Football','Unknown'),'22023');
  perform pg_temp.denied(format('select public.create_roster_fixture(%L,%L,%L::jsonb,%L::jsonb)',pg_temp.pid('sport'),'Duplicate',jsonb_build_object('kind','group','id',first_team),jsonb_build_object('kind','group','id',first_team)),'22023');
  perform pg_temp.denied(format('select public.create_roster_fixture(%L,%L,%L::jsonb,%L::jsonb)',pg_temp.pid('sport'),'Cross event',jsonb_build_object('kind','group','id',first_team),jsonb_build_object('kind','group','id',(select id from public.participant_groups where event_id=pg_temp.pid('group') and state='published' limit 1))),'22023');
  select to_jsonb(pg) into g from public.participant_groups pg where id=first_team;
  perform public.manage_team_proposal(pg_temp.pid('sport'),first_team,'save',jsonb_build_object('version',g->'roster_version','name','Renamed batch team','applicationIds',g->'proposed_application_ids','reason','Name correction'));
  perform pg_temp.check_true((select participant_a_group_id=first_team from public.fixtures where id=f.id),'Rename unlinked the fixture');
  -- Captain replacement cannot take the leader of another draft in this same event.
  select id into reserve_app from public.applications where event_id=pg_temp.pid('group') and student_id=pg_temp.pid('reserve');
  draft_team:=public.manage_team_proposal(pg_temp.pid('group'),null,'appoint',jsonb_build_object('leaderApplicationId',reserve_app));
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('group'),draft_team->>'id','appoint',jsonb_build_object('leaderApplicationId',(select id from public.applications where event_id=pg_temp.pid('group') and student_id=pg_temp.pid('member')))),'22023');
  for app in select * from public.applications where event_id=pg_temp.pid('solo') loop perform public.review_application(app.id,'approved',null); end loop;
  select id into captain_app from public.applications where event_id=pg_temp.pid('solo') and student_id=pg_temp.pid('captain');
  select id into member_app from public.applications where event_id=pg_temp.pid('solo') and student_id=pg_temp.pid('member');
  select id into reserve_app from public.applications where event_id=pg_temp.pid('solo') and student_id=pg_temp.pid('reserve');
  perform public.select_solo_application(reserve_app,'reserve','Reserve player');
  perform pg_temp.check_true(not exists(select 1 from public.list_result_participants(pg_temp.pid('solo')) where target_id=reserve_app),'Reserve leaked into official match roster');
  perform pg_temp.denied(format('select public.create_roster_fixture(%L,%L,%L::jsonb,%L::jsonb)',pg_temp.pid('solo'),'Reserve',jsonb_build_object('kind','application','id',captain_app),jsonb_build_object('kind','application','id',reserve_app)),'22023');
  perform pg_temp.denied(format('select public.create_fixture(%L,%L,%L,%L)',pg_temp.pid('solo'),'Legacy bypass','Not registered A','Not registered B'),'22023');
  solo_fixture:=public.create_roster_fixture(pg_temp.pid('solo'),'Round 1',jsonb_build_object('kind','application','id',captain_app),jsonb_build_object('kind','application','id',member_app),'Room',null,now());
  count_sent:=public.generate_fixture_reminders(solo_fixture.id,'Report to the room.');
  perform pg_temp.check_true(count_sent=2,'Fixture reminder reached unrelated selected players');
  perform pg_temp.check_true(not exists(select 1 from public.reminders where source_version='fixture:'||solo_fixture.id||':v'||solo_fixture.schedule_version and profile_id not in(pg_temp.pid('captain'),pg_temp.pid('member'))),'Reminders leaked to another match');
  before_count:=(select count(*) from public.fixtures);
  perform pg_temp.denied(format('select public.bulk_create_roster_fixtures(%L,%L::jsonb)',pg_temp.pid('solo'),jsonb_build_array(
    jsonb_build_object('stage','Bulk valid','participantA',jsonb_build_object('kind','application','id',captain_app),'participantB',jsonb_build_object('kind','application','id',member_app)),
    jsonb_build_object('stage','Bulk invalid','participantA',jsonb_build_object('kind','application','id',captain_app),'participantB',jsonb_build_object('kind','application','id',reserve_app)))),'22023');
  perform pg_temp.check_true((select count(*) from public.fixtures)=before_count,'Failed bulk call saved a partial schedule');
  perform pg_temp.pclaim('reserve');
  perform pg_temp.denied(format('select public.create_roster_fixture(%L,%L,%L::jsonb,%L::jsonb)',pg_temp.pid('sport'),'Unauthorised',jsonb_build_object('kind','group','id',first_team),jsonb_build_object('kind','group','id',second_team)),'42501');
  perform pg_temp.pclaim('admin');
  perform pg_temp.denied(format('select public.create_roster_fixture(%L,%L,%L::jsonb,%L::jsonb,null,%L,%L)',pg_temp.pid('sport'),'Invalid reporting',jsonb_build_object('kind','group','id',first_team),jsonb_build_object('kind','group','id',second_team),now()+interval '1 hour',now()),'22023');
  -- Pair fixtures choose two published pairs, never two unpaired students.
  update public.events set operating_method='live_matches',score_template='badminton' where id=pg_temp.pid('pair');
  select id into captain_app from public.participant_groups where event_id=pg_temp.pid('pair') and state='published';
  perform pg_temp.pclaim('reserve');
  g:=public.pair_invitation_command(pg_temp.pid('pair'),'invite',null,pg_temp.pid('outsider'));
  perform pg_temp.pclaim('outsider');
  g:=public.pair_invitation_command(pg_temp.pid('pair'),'accept',(g->>'id')::uuid);
  member_app:=(g->>'group_id')::uuid;
  perform pg_temp.pclaim('admin');
  for app in select * from public.applications where event_id=pg_temp.pid('pair') and student_id in(pg_temp.pid('reserve'),pg_temp.pid('outsider')) loop perform public.review_application(app.id,'approved',null); end loop;
  select to_jsonb(pg) into g from public.participant_groups pg where id=member_app;
  perform public.manage_team_proposal(pg_temp.pid('pair'),member_app,'publish',jsonb_build_object('version',g->'roster_version'));
  perform public.create_roster_fixture(pg_temp.pid('pair'),'Doubles',jsonb_build_object('kind','group','id',captain_app),jsonb_build_object('kind','group','id',member_app),'Court',null,now());
  -- Group fixtures use the same final-roster identity path without a batch restriction.
  update public.events set operating_method='fixtures_only' where id=pg_temp.pid('group');
  select id into captain_app from public.participant_groups where event_id=pg_temp.pid('group') and state='published';
  select to_jsonb(pg) into g from public.participant_groups pg where event_id=pg_temp.pid('group') and captain_id=pg_temp.pid('member') and state='draft';
  member_app:=(g->>'id')::uuid;
  g:=public.manage_team_proposal(pg_temp.pid('group'),member_app,'save',jsonb_build_object('version',g->'roster_version','name','Second group','applicationIds',(select jsonb_agg(id) from public.applications where event_id=pg_temp.pid('group') and student_id in(pg_temp.pid('member'),pg_temp.pid('reserve')))));
  perform public.manage_team_proposal(pg_temp.pid('group'),member_app,'publish',jsonb_build_object('version',g->'roster_version'));
  perform public.create_roster_fixture(pg_temp.pid('group'),'Group pairing',jsonb_build_object('kind','group','id',captain_app),jsonb_build_object('kind','group','id',member_app),'Room',null,now());
  update public.access_records set state='suspended' where profile_id=pg_temp.pid('outsider2');
  perform pg_temp.denied(format('select public.start_fixture_for_scoring(%L,gen_random_uuid())',f.id),'22023');
  perform pg_temp.check_true((select actual_started_at is null from public.fixtures where id=f.id),'Failed start changed the match');
  update public.access_records set state='active' where profile_id=pg_temp.pid('outsider2');
  perform public.start_fixture_for_scoring(f.id,pg_temp.pid('admin'));
  select * into checkpoint from public.score_snapshots where fixture_id=f.id order by version desc limit 1;
  perform pg_temp.check_true(checkpoint.status='live','Match start did not initialise scoring');
  -- Mid-match account changes must not discard scoring or prevent final score persistence.
  update public.access_records set state='suspended' where profile_id=pg_temp.pid('outsider2');
  perform public.write_score_snapshot(f.id,checkpoint.version,checkpoint.score_payload,'final');
  perform pg_temp.check_true((select state='completed' from public.fixtures where id=f.id),'Existing final-score flow regressed');
  insert into public.point_rules(event_id,"placing",points,configured_by) values(pg_temp.pid('sport'),1,10,pg_temp.pid('admin'));
  perform pg_temp.denied(format('select public.publish_unified_results(%L,%L::jsonb)',pg_temp.pid('sport'),jsonb_build_array(jsonb_build_object('placing',1,'groupId',second_team))),'22023');
  update public.access_records set state='active' where profile_id=pg_temp.pid('outsider2');
  pub:=public.publish_unified_results(pg_temp.pid('sport'),jsonb_build_array(jsonb_build_object('placing',1,'groupId',first_team)));
  perform pg_temp.check_true(pub.state='published' and exists(select 1 from public.result_positions where publication_id=pub.id and group_id=first_team),'Manual final award publication lost the roster reference');
  perform public.delete_owned_event(pg_temp.pid('sport'));
  set constraints all immediate;
  perform pg_temp.check_true(not exists(select 1 from public.fixtures where id=f.id),'New participant foreign keys broke authorised full-event deletion');
end $$;
