-- Fictional identities stay in the isolated in-memory database and roll back.
do $$ begin
  if current_setting('spandan.isolated_tests',true) is distinct from 'on' then raise exception 'An isolated test database is required'; end if;
end $$;
begin;
create temporary table participation_test_ids(name text primary key,id uuid default gen_random_uuid());
insert into participation_test_ids(name) values('edition'),('batch'),('other_batch'),('admin'),('captain'),('member'),('reserve'),('outsider'),('female'),('inactive'),('unregistered'),('sport'),('group'),('pair'),('solo'),('girls'),('scheduled'),('closed'),('theme');
grant select on participation_test_ids to authenticated,anon;
create function pg_temp.pid(p_name text) returns uuid language sql as $$ select id from participation_test_ids where name=p_name $$;
create function pg_temp.pclaim(p_name text) returns void language sql as $$ select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.pid(p_name),'role','authenticated','session_id',pg_temp.pid(p_name))::text,true)::text::void $$;
create function pg_temp.check_true(ok boolean,message text) returns void language plpgsql as $$ begin
  if ok is distinct from true then raise exception '%',message; end if;
end $$;
create function pg_temp.denied(sql text,code text,expected_detail text default null) returns void language plpgsql as $$
declare actual_detail text;
begin
  execute sql;
  raise exception 'Expected denial: %',sql;
exception when others then
  get stacked diagnostics actual_detail=pg_exception_detail;
  if sqlstate<>code or (expected_detail is not null and expected_detail is distinct from actual_detail) then
    raise exception 'Expected % / %, got % / %: % (%)',code,expected_detail,sqlstate,actual_detail,sqlerrm,sql;
  end if;
end $$;

insert into public.editions(id,name,status) values(pg_temp.pid('edition'),'Isolated participation acceptance','published');
insert into public.batches(id,edition_id,label,course_label,eligible)
select id,pg_temp.pid('edition'),case when name='batch' then '2023' else '2024' end,'MBBS',true from participation_test_ids where name in ('batch','other_batch');
insert into auth.users(id,email) select id,name||'@participation.invalid' from participation_test_ids where name in ('admin','captain','member','reserve','outsider','female','inactive','unregistered');
insert into auth.sessions(id,user_id) select id,id from participation_test_ids where name in ('admin','captain','member','reserve','outsider','female','inactive','unregistered');
insert into public.profiles(id,full_name,batch_id,roll_canonical,phone_e164,fest_id,gender)
select id,'Test '||name,pg_temp.pid(case when name='outsider' then 'other_batch' else 'batch' end),row_number() over(order by name)::text,
  '+91970000000'||row_number() over(order by name),'SPD-'||upper(substr(replace(id::text,'-',''),1,12)),case when name='female' then 'female' else 'male' end
from participation_test_ids where name in ('admin','captain','member','reserve','outsider','female','inactive','unregistered');
insert into public.access_records(edition_id,profile_id,state,verified_at)
select pg_temp.pid('edition'),id,case when name='inactive' then 'pending'::public.access_state else 'active'::public.access_state end,
  case when name='inactive' then null else now() end from participation_test_ids where name in ('admin','captain','member','reserve','outsider','female','inactive','unregistered');
insert into public.staff_assignments(profile_id,role) values(pg_temp.pid('admin'),'main_admin');
insert into public.events(id,edition_id,title,slug,category,format,state,registration_enabled,application_opens_at,application_closes_at,
  application_capacity,waitlist_enabled,group_min_size,group_max_size,batch_restricted,eligibility,application_questions)
select id,pg_temp.pid('edition'),'Test '||name,'participation-'||name,'sport',
  case when name in ('sport','group','pair') then name::public.event_format when name='theme' then 'group'::public.event_format else 'solo'::public.event_format end,
  'open',true,case when name='scheduled' then now()+interval '1 second' else now()-interval '1 day' end,
  case when name='closed' then now() else now()+interval '1 day' end,1,true,
  case when name in ('sport','group','pair') then 2 when name='theme' then 1 end,
  case when name in ('sport','group','pair','theme') then 2 end,name='sport',
  case when name='girls' then '{"division":"girls"}'::jsonb when name='sport' then '{"division":"boys"}'::jsonb else '{"division":"open"}'::jsonb end,
  '[{"key":"slot","label":"Preferred slot","type":"select","required":true,"options":["A","B"]}]'
from participation_test_ids where name in ('sport','group','pair','solo','girls','scheduled','closed','theme');

do $$
declare person text; event_name text; a public.applications; g jsonb; second jsonb; i jsonb; workspace jsonb; captain_app uuid; member_app uuid; outsider_app uuid;
begin
  perform pg_temp.pclaim('captain');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('scheduled'),'{"slot":"A"}'),'22023','scheduled');
  update public.events set application_opens_at=now() where id=pg_temp.pid('scheduled');
  perform public.apply_to_event(pg_temp.pid('scheduled'),gen_random_uuid(),'{"slot":"A"}');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('closed'),'{"slot":"A"}'),'22023','closed');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('girls'),'{"slot":"A"}'),'42501','gender_mismatch');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('sport'),'{}'),'22023','invalid_answers');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('sport'),'{"slot":"unlisted"}'),'22023','invalid_answers');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('sport'),'{"slot":42}'),'22023','invalid_answers');
  perform pg_temp.pclaim('inactive');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('sport'),'{"slot":"A"}'),'42501','access_inactive');
  perform pg_temp.pclaim('female');
  perform public.apply_to_event(pg_temp.pid('girls'),gen_random_uuid(),'{"slot":"A"}');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('sport'),'{"slot":"A"}'),'42501','gender_mismatch');
  foreach person in array array['captain','member','reserve','outsider'] loop
    perform pg_temp.pclaim(person);
    foreach event_name in array array['sport','group','pair','solo'] loop
      a:=public.apply_to_event(pg_temp.pid(event_name),gen_random_uuid(),'{"slot":"A"}');
      perform pg_temp.check_true(a.review_state=case when event_name='solo' and person<>'captain' then 'waitlisted'::public.application_review_state else 'submitted'::public.application_review_state end,'Pool was incorrectly capped or auto-approved');
      perform pg_temp.check_true((public.apply_to_event(pg_temp.pid(event_name),a.idempotency_key,'{"slot":"A"}')).id=a.id,'Retry created a duplicate application');
    end loop;
  end loop;
  perform pg_temp.check_true(not exists(select 1 from public.participant_groups where event_id=pg_temp.pid('sport')),'Registration created a captain/team');
  update public.events set waitlist_enabled=false where id=pg_temp.pid('solo');
  perform pg_temp.pclaim('female');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('solo'),'{"slot":"A"}'),'23505','capacity_full');
  select id into captain_app from public.applications where event_id=pg_temp.pid('sport') and student_id=pg_temp.pid('captain');
  select id into member_app from public.applications where event_id=pg_temp.pid('sport') and student_id=pg_temp.pid('member');
  select id into outsider_app from public.applications where event_id=pg_temp.pid('sport') and student_id=pg_temp.pid('outsider');
  perform pg_temp.pclaim('admin');
  perform pg_temp.check_true(jsonb_array_length(public.get_team_workspace(pg_temp.pid('sport'))->'candidates')=0,'Pending applications exposed as candidates');
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,null,%L,%L::jsonb)',pg_temp.pid('sport'),'appoint',jsonb_build_object('leaderApplicationId',captain_app)),'22023');
  for a in select * from public.applications where event_id in (pg_temp.pid('sport'),pg_temp.pid('group')) loop
    perform public.review_application(a.id,'approved',null);
  end loop;
  g:=public.manage_team_proposal(pg_temp.pid('sport'),null,'appoint',jsonb_build_object('leaderApplicationId',captain_app,'batchId',pg_temp.pid('batch')));
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,null,%L,%L::jsonb)',pg_temp.pid('sport'),'appoint',jsonb_build_object('leaderApplicationId',member_app,'batchId',pg_temp.pid('batch'))),'23505');
  perform pg_temp.pclaim('member');
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('sport'),g->>'id','save',jsonb_build_object('version',0,'name','Unauthorized','applicationIds',jsonb_build_array(captain_app,member_app))),'42501');
  perform pg_temp.pclaim('captain');
  workspace:=public.get_team_workspace(pg_temp.pid('sport'));
  perform pg_temp.check_true(not exists(select 1 from jsonb_array_elements(workspace->'candidates') c where c->>'studentId'=pg_temp.pid('outsider')::text),'Captain saw cross-batch candidates');
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('sport'),g->>'id','save',jsonb_build_object('version',0,'name','Cross batch','applicationIds',jsonb_build_array(captain_app,outsider_app))),'22023');
  g:=public.manage_team_proposal(pg_temp.pid('sport'),(g->>'id')::uuid,'save',jsonb_build_object('version',0,'name','2023 Football','applicationIds',jsonb_build_array(captain_app,member_app)));
  g:=public.manage_team_proposal(pg_temp.pid('sport'),(g->>'id')::uuid,'submit',jsonb_build_object('version',g->'roster_version'));
  perform pg_temp.pclaim('member');
  perform pg_temp.check_true((public.get_team_workspace(pg_temp.pid('sport'))->>'proposed')::boolean,'Participant proposal status missing');
  perform pg_temp.check_true(jsonb_array_length(public.get_team_workspace(pg_temp.pid('sport'))->'candidates')=0,'Ordinary participant can browse the pool');
  perform pg_temp.pclaim('admin');
  g:=public.manage_team_proposal(pg_temp.pid('sport'),(g->>'id')::uuid,'publish',jsonb_build_object('version',g->'roster_version'));
  perform pg_temp.check_true(g->>'state'='published','Squad not published');
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('sport'),g->>'id','return','{"version":0,"reason":"stale"}'),'55000');
  perform pg_temp.pclaim('reserve');
  perform pg_temp.check_true((public.get_team_workspace(pg_temp.pid('sport'))->>'finalTeamPublished')::boolean,'Unselected pool member cannot see final-team status');
  perform pg_temp.check_true((select review_state='approved' and selection_state='unselected' from public.applications where event_id=pg_temp.pid('sport') and student_id=pg_temp.pid('reserve')),'Team selection rejected a registration');
  perform pg_temp.pclaim('admin');
  perform public.manage_team_proposal(pg_temp.pid('sport'),(g->>'id')::uuid,'appoint',jsonb_build_object('leaderApplicationId',member_app,'batchId',pg_temp.pid('batch')));
  update public.events set roster_lock_at=now() where id=pg_temp.pid('sport');
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('sport'),g->>'id','appoint',jsonb_build_object('leaderApplicationId',captain_app)),'22023');
  -- Groups may have multiple entries from the same batch and may mix batches.
  g:=public.manage_team_proposal(pg_temp.pid('group'),null,'appoint',jsonb_build_object('leaderApplicationId',(select id from public.applications where event_id=pg_temp.pid('group') and student_id=pg_temp.pid('captain'))));
  second:=public.manage_team_proposal(pg_temp.pid('group'),null,'appoint',jsonb_build_object('leaderApplicationId',(select id from public.applications where event_id=pg_temp.pid('group') and student_id=pg_temp.pid('member'))));
  perform pg_temp.pclaim('captain');
  g:=public.manage_team_proposal(pg_temp.pid('group'),(g->>'id')::uuid,'save',jsonb_build_object('version',0,'name','Mixed group','applicationIds',(select jsonb_agg(id) from public.applications where event_id=pg_temp.pid('group') and student_id in(pg_temp.pid('captain'),pg_temp.pid('outsider')))));
  g:=public.manage_team_proposal(pg_temp.pid('group'),(g->>'id')::uuid,'submit',jsonb_build_object('version',g->'roster_version'));
  perform pg_temp.pclaim('admin');
  perform public.manage_team_proposal(pg_temp.pid('group'),(g->>'id')::uuid,'publish',jsonb_build_object('version',g->'roster_version'));
  perform pg_temp.pclaim('member');
  second:=public.manage_team_proposal(pg_temp.pid('group'),(second->>'id')::uuid,'save',jsonb_build_object('version',0,'name','Conflicting group','applicationIds',(select jsonb_agg(id) from public.applications where event_id=pg_temp.pid('group') and student_id in(pg_temp.pid('member'),pg_temp.pid('outsider')))));
  second:=public.manage_team_proposal(pg_temp.pid('group'),(second->>'id')::uuid,'submit',jsonb_build_object('version',second->'roster_version'));
  perform pg_temp.pclaim('admin');
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('group'),second->>'id','publish',jsonb_build_object('version',second->'roster_version')),'22023');
  -- Invites must never create a registration for sender or recipient.
  perform pg_temp.pclaim('unregistered');
  perform pg_temp.denied(format('select public.pair_invitation_command(%L,%L,null,%L)',pg_temp.pid('pair'),'invite',pg_temp.pid('captain')),'22023');
  perform pg_temp.pclaim('captain');
  perform pg_temp.denied(format('select public.pair_invitation_command(%L,%L,null,%L)',pg_temp.pid('pair'),'invite',pg_temp.pid('unregistered')),'22023');
  perform pg_temp.check_true(not exists(select 1 from public.applications where student_id=pg_temp.pid('unregistered')),'Invitation created an application');
  i:=public.pair_invitation_command(pg_temp.pid('pair'),'invite',null,pg_temp.pid('member'));
  perform pg_temp.denied(format('select public.pair_invitation_command(%L,%L,%L)',pg_temp.pid('pair'),'accept',i->>'id'),'42501');
  perform pg_temp.pclaim('member');
  i:=public.pair_invitation_command(pg_temp.pid('pair'),'accept',(i->>'id')::uuid);
  perform pg_temp.pclaim('admin');
  select to_jsonb(pg) into g from public.participant_groups pg where id=(i->>'group_id')::uuid;
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('pair'),g->>'id','publish',jsonb_build_object('version',g->'roster_version')),'22023');
  for a in select * from public.applications where event_id=pg_temp.pid('pair') and student_id in(pg_temp.pid('captain'),pg_temp.pid('member')) loop
    perform public.review_application(a.id,'approved',null);
  end loop;
  perform public.manage_team_proposal(pg_temp.pid('pair'),(g->>'id')::uuid,'publish',jsonb_build_object('version',g->'roster_version'));
  perform pg_temp.check_true((select captain_id is null from public.participant_groups where id=(g->>'id')::uuid),'Pair incorrectly requires a captain');
  -- Theme metadata still constrains registration answers and final performance size.
  update public.events set eligibility='{"division":"open","theme_roster_policy":{"themeQuestionKey":"theme","characterQuestionKey":"character","sizes":{"Solo":1,"Duo":2}}}',
    application_questions='[{"key":"theme","label":"Theme","type":"select","required":true,"options":["Solo","Duo"]},{"key":"character","label":"Character","type":"text","required":true}]'
    where id=pg_temp.pid('theme');
  perform pg_temp.pclaim('captain');
  perform pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('theme'),'{"theme":"Duo","character":" "}'),'22023','invalid_answers');
  a:=public.apply_to_event(pg_temp.pid('theme'),gen_random_uuid(),'{"theme":"Duo","character":"Hero"}');
  perform pg_temp.pclaim('admin');
  perform public.review_application(a.id,'approved',null);
  g:=public.manage_team_proposal(pg_temp.pid('theme'),null,'appoint',jsonb_build_object('leaderApplicationId',a.id));
  perform pg_temp.pclaim('captain');
  g:=public.manage_team_proposal(pg_temp.pid('theme'),(g->>'id')::uuid,'save',jsonb_build_object('version',0,'name','Duo performance','applicationIds',jsonb_build_array(a.id)));
  perform pg_temp.denied(format('select public.manage_team_proposal(%L,%L,%L,%L::jsonb)',pg_temp.pid('theme'),g->>'id','submit',jsonb_build_object('version',g->'roster_version')),'22023');
end $$;

-- Actual end-user permissions, not just privileged fixture assertions.
set local role authenticated;
select pg_temp.pclaim('captain');
select pg_temp.denied('insert into public.participant_groups(event_id,name) values(gen_random_uuid(),''Bypass'')','42501');
select pg_temp.check_true(not exists(select 1 from public.applications where student_id<>auth.uid()),'Application RLS leaked another participant');
set local role anon;
select pg_temp.denied(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.pid('sport'),'{"slot":"A"}'),'42501');
reset role;
rollback;
