-- Run against the isolated QA project after the fixture-start migration.
-- All fixture, event, score and audit changes are rolled back.
begin;
do $$
declare
  actor uuid; target public.fixtures; parent public.events; started public.fixtures;
  checkpoint public.score_snapshots; prepared jsonb; template text; before_version integer;
  started_at timestamptz; initial_clock numeric;
begin
  select profile_id into actor from public.staff_assignments where role='main_admin' and revoked_at is null limit 1;
  assert actor is not null, 'A QA main admin is required';
  perform set_config('request.jwt.claim.sub',actor::text,true);
  select * into target from public.fixtures order by created_at limit 1;
  assert target.id is not null, 'A QA fixture is required';
  select * into parent from public.events where id=target.event_id;
  update public.events set state='open' where id=parent.id;
  update public.fixtures set actual_started_at=null,state='scheduled',starts_at=now()+interval '2 days',reporting_at=null where id=target.id;

  begin
    perform public.create_fixture((select id from public.events where format='sport' limit 1),'QA roster guard','Unpublished team A','Unpublished team B',null,null,now());
    raise exception 'Unpublished team names were incorrectly accepted';
  exception when sqlstate '22023' then null; end;

  begin
    perform public.start_fixture(target.id);
    raise exception 'Future match was incorrectly started';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.prepare_fixture_offline(target.id,gen_random_uuid());
    raise exception 'Scorer was incorrectly prepared before start';
  exception when sqlstate '22023' then null; end;
  begin
    perform public.write_score_snapshot(target.id,0,'{}','live');
    raise exception 'Score was incorrectly saved before start';
  exception when sqlstate '22023' then null; end;

  update public.fixtures set starts_at=now()-interval '2 days' where id=target.id;
  begin
    perform public.start_fixture(target.id);
    raise exception 'Past match was incorrectly started';
  exception when sqlstate '22023' then null; end;

  foreach template in array array['football','cricket','badminton','set_based','basketball','generic'] loop
    update public.events set state='open',score_template=template where id=parent.id;
    update public.fixtures set actual_started_at=null,state='scheduled',starts_at=now(),reporting_at=null where id=target.id;
    select coalesce(max(version),0) into before_version from public.score_snapshots where fixture_id=target.id;
    started:=public.start_fixture(target.id);
    assert started.actual_started_at is not null, 'Start timestamp missing';
    assert started.state='ongoing', 'Match did not go live';
    select * into checkpoint from public.score_snapshots where fixture_id=target.id order by version desc limit 1;
    assert checkpoint.version=before_version+1, 'Start must create exactly one initial score';
    assert checkpoint.status='live', 'Initial score is not live';
    assert checkpoint.provisional=(template='cricket'), 'Cricket reconciliation privacy was lost';
    started_at:=started.actual_started_at;
    started:=public.start_fixture(target.id);
    assert started.actual_started_at=started_at, 'Repeated start reset the match';
    assert (select max(version) from public.score_snapshots where fixture_id=target.id)=checkpoint.version, 'Repeated start created a score';
    prepared:=public.prepare_fixture_offline(target.id,'00000000-0000-4000-8000-000000000001');
    assert prepared->>'actualStartedAt' is not null, 'Offline scorer lacks the start marker';
    assert prepared->>'status'='live', 'Offline scorer did not open live';
    if template in ('football','basketball') then
      initial_clock:=(checkpoint.score_payload->>'clock_seconds')::numeric;
      checkpoint:=public.write_score_snapshot(target.id,checkpoint.version,checkpoint.score_payload || jsonb_build_object('clock_started_at',now()-interval '10 seconds'),'paused');
      assert checkpoint.score_payload->>'clock_running'='false', 'Pause did not stop the clock';
      assert (checkpoint.score_payload->>'clock_seconds')::numeric=initial_clock+case when template='basketball' then -10 else 10 end, 'Clock elapsed time was lost';
    end if;
    checkpoint:=public.write_score_snapshot(target.id,checkpoint.version,checkpoint.score_payload,'final');
    assert (select state from public.fixtures where id=target.id)='completed', 'Final score did not finish the match';
    begin
      perform public.start_fixture(target.id);
      raise exception 'A finished match was incorrectly started';
    exception when sqlstate '22023' then null; end;
    perform public.release_fixture_score_lease(target.id,'00000000-0000-4000-8000-000000000001',false);
  end loop;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.start_fixture(target.id);
    raise exception 'Anonymous caller could start a match';
  exception when sqlstate '28000' then null; end;
end;
$$;
rollback;
