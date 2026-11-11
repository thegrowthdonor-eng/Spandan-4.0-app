-- Isolated QA/local only. Mock media references test database rules, not Cloudflare delivery.
begin;
do $test$
declare actor uuid; voter uuid; session_id uuid; eid uuid:=gen_random_uuid(); app uuid; app_owner uuid; asset uuid:=gen_random_uuid(); entry uuid; round_id uuid; option_id uuid; token text:=repeat('a',64); result jsonb; version integer;
begin
  select profile_id into actor from public.staff_assignments where role='main_admin' and revoked_at is null limit 1;
  select id into session_id from auth.sessions where user_id=actor limit 1;
  if actor is null or session_id is null then raise exception 'Sign into the fictional QA owner once before capability tests'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session_id)::text,true);
  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(e)||jsonb_build_object('id',eid,'slug','qa-voting-'||replace(eid::text,'-',''),'title','QA voting '||eid,'state','open','registration_enabled',true))).* from public.events e where e.format='solo' and e.registration_enabled limit 1;
  insert into public.applications select (jsonb_populate_record(null::public.applications,to_jsonb(a)||jsonb_build_object('id',gen_random_uuid(),'event_id',eid,'idempotency_key',gen_random_uuid()))).* from public.applications a join public.events e on e.id=a.event_id where e.format='solo' and a.review_state='approved' and a.selection_state<>'not_selected' limit 1;
  select id,student_id into app,app_owner from public.applications where event_id=eid;
  perform public.competition_command(eid,'settings',jsonb_build_object('schedule_mode','submission','result_mode','public_vote','attempts',1,'submission_closes_at',now()+interval '1 day','version',0));
  insert into public.media_assets(id,owner_id,event_id,purpose,provider,object_key,state,input_mime,input_size,expires_at,public_url)
    values(asset,actor,eid,'competition','supabase','qa-mock/'||asset,'public','image/webp',100,now()+interval '1 day','https://example.test/qa-image.webp');
  perform public.competition_command(eid,'entry',jsonb_build_object('application_id',app,'group_id',null,'title','Staff upload','description','QA','media_id',asset,'submit',true,'version',0));
  select id,competition_entries.version into entry,version from public.competition_entries where event_id=eid;
  perform public.competition_command(eid,'review_entry',jsonb_build_object('entry_id',entry,'version',version,'state','approved','reason',''));
  select p.id into voter from public.profiles p where p.id not in(actor,app_owner) and not exists(select 1 from public.staff_assignments s where s.profile_id=p.id and s.revoked_at is null) limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',voter,'role','authenticated')::text,true);
  begin
    perform public.competition_command(eid,'entry',jsonb_build_object('application_id',app,'group_id',null,'title','Wrong owner','description','QA','media_id',asset,'submit',true,'version',2));
    raise exception 'Another participant replaced an entry';
  exception when sqlstate '42501' then null;end;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',app_owner,'role','authenticated')::text,true);
  select competition_entries.version into version from public.competition_entries where id=entry;
  perform public.competition_command(eid,'entry',jsonb_build_object('application_id',app,'group_id',null,'title','Participant replacement','description','QA','media_id',asset,'submit',true,'version',version));
  assert (select state='submitted' and public_media_url is null from public.competition_entries where id=entry),'Replacement silently remained published';
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated','session_id',session_id)::text,true);
  select competition_entries.version into version from public.competition_entries where id=entry;
  begin
    perform public.competition_command(eid,'review_entry',jsonb_build_object('entry_id',entry,'version',version,'state','rejected','reason',''));
    raise exception 'Rejection accepted without reason';
  exception when sqlstate '22023' then null;end;
  perform public.competition_command(eid,'review_entry',jsonb_build_object('entry_id',entry,'version',version,'state','approved','reason',''));
  update public.competition_entries set public_media_url='https://example.test/qa-image.webp' where id=entry;
  -- Build a second approved option by cloning a different approved registration.
  insert into public.applications select (jsonb_populate_record(null::public.applications,to_jsonb(a)||jsonb_build_object('id',gen_random_uuid(),'event_id',eid,'idempotency_key',gen_random_uuid()))).* from public.applications a join public.events e on e.id=a.event_id where e.format='solo' and a.review_state='approved' and a.selection_state<>'not_selected' and a.student_id<>app_owner limit 1 returning id into app;
  insert into public.competition_entries(event_id,application_id,title,media_id,public_media_url,state,submitted_by) values(eid,app,'Second option',asset,'https://example.test/qa-image.webp','approved',actor);
  update public.competition_settings set submission_closes_at=now()-interval '2 hours' where event_id=eid;
  insert into public.point_rules(event_id,"placing",points,configured_by) values(eid,1,10,actor),(eid,2,7,actor);
  perform public.competition_command(eid,'voting_round',jsonb_build_object('opens_at',now()-interval '1 hour','closes_at',now()+interval '1 hour'));
  select id into round_id from public.polls where event_id=eid;
  select id into option_id from public.poll_options where poll_id=round_id order by sort_order limit 1;
  result:=public.public_competition(eid);
  assert result->'rounds'->0->'options'->0->'votes'='null'::jsonb,'Open totals leaked';
  begin
    perform public.competition_command(eid,'entry',jsonb_build_object('application_id',app,'group_id',null,'title','Frozen replacement','description','QA','media_id',asset,'submit',true,'version',1));
    raise exception 'Frozen content changed';
  exception when sqlstate '22023' then null;end;
  insert into private.competition_vote_grants(token_hash,profile_id,poll_id,session_id,expires_at) values(encode(extensions.digest(token,'sha256'),'hex'),actor,round_id,session_id,now()-interval '1 minute');
  begin perform public.cast_competition_vote(token,option_id);raise exception 'Expired capability voted';exception when sqlstate '42501' then null;end;
  update private.competition_vote_grants set expires_at=now()+interval '10 minutes' where poll_id=round_id;
  update private.competition_vote_grants set revoked_at=now() where poll_id=round_id;
  begin perform public.cast_competition_vote(token,option_id);raise exception 'Revoked capability voted';exception when sqlstate '42501' then null;end;
  update private.competition_vote_grants set revoked_at=null where poll_id=round_id;
  update public.polls set closes_at=now()-interval '1 minute' where id=round_id;
  begin perform public.cast_competition_vote(token,option_id);raise exception 'Closed round accepted a new vote';exception when sqlstate '22023' then null;end;
  begin perform public.competition_command(eid,'verify_votes','{}');raise exception 'Zero-vote round produced an automatic winner';exception when sqlstate '22023' then null;end;
  update public.polls set closes_at=now()+interval '1 hour' where id=round_id;
  update public.events set state='cancelled' where id=eid;
  begin perform public.cast_competition_vote(token,option_id);raise exception 'Cancelled event accepted a new vote';exception when sqlstate '22023' then null;end;
  update public.events set state='open' where id=eid;
  result:=public.cast_competition_vote(token,option_id);
  assert result ? 'receiptId' and not(result ? 'votes'),'Receipt leaks aggregates';
  assert public.cast_competition_vote(token,(select id from public.poll_options where poll_id=round_id and id<>option_id))->>'optionId'=option_id::text,'Retry changed the original ballot';
  assert (select count(*)=1 from public.poll_votes where poll_id=round_id),'Duplicate ballot inserted';
  assert (select vote_count=1 from public.poll_options where id=option_id),'Counter incremented twice';
  update public.polls set closes_at=now()-interval '1 minute' where id=round_id;
  assert public.cast_competition_vote(token,option_id)->>'optionId'=option_id::text,'Closed retry lost existing receipt';
  update public.poll_options set vote_count=2 where id=option_id;
  begin perform public.competition_command(eid,'verify_votes','{}');raise exception 'Counter mismatch was verified';exception when sqlstate '22023' then null;end;
  update public.poll_options set vote_count=1 where id=option_id;
  select competition_entries.version into version from public.competition_entries where id=entry;
  perform public.competition_command(eid,'review_entry',jsonb_build_object('entry_id',entry,'version',version,'state','disqualified','reason','QA audited disqualification'));
  assert (select count(*)=1 from public.poll_votes where poll_id=round_id),'Disqualification destroyed ballots';
  begin perform public.competition_command(eid,'verify_votes','{}');raise exception 'All votes on a disqualified entry produced a winner';exception when sqlstate '22023' then null;end;
  perform set_config('request.jwt.claims','{}',true);
  result:=public.public_competition(eid);
  assert not(result::text like '%submitted_by%') and not(result::text like '%application_id%'),'Private entry ownership leaked';
end $test$;
rollback;
