-- Isolated local database only. Never run fictional identities against production.
do $$ begin
  if current_setting('spandan.isolated_tests',true) is distinct from 'on' then raise exception 'An isolated test database is required'; end if;
end $$;
begin;
create temporary table senior_test_ids(name text primary key,id uuid default gen_random_uuid());
insert into senior_test_ids(name) values('edition'),('batch'),('admin'),('coordinator'),('stranger'),('ug'),('pg'),('jr'),('fmg'),('faculty'),('failed'),('solo'),('pair'),('group'),('sport'),('closed'),('girls'),('poll'),('option1'),('option2');
grant select on senior_test_ids to authenticated,anon,service_role;
create function pg_temp.sid(p_name text) returns uuid language sql as $$ select id from senior_test_ids where name=p_name $$;
create function pg_temp.claim(p_name text) returns void language sql as $$ select set_config('request.jwt.claims',jsonb_build_object('sub',pg_temp.sid(p_name),'role','authenticated','session_id',pg_temp.sid(p_name))::text,true)::text::void $$;
create function pg_temp.expect_error(p_sql text,p_code text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'Expected denial: %',p_sql;
exception when others then
  if sqlstate<>p_code then raise exception 'Expected %, got %: % (%).',p_code,sqlstate,sqlerrm,p_sql; end if;
end $$;

insert into public.editions(id,name,status) values(pg_temp.sid('edition'),'Isolated senior acceptance','published');
insert into public.batches(id,edition_id,label,course_label,eligible) values(pg_temp.sid('batch'),pg_temp.sid('edition'),'2023','MBBS',true);
insert into auth.users(id,email) select id,name||'@isolated.invalid' from senior_test_ids where name in ('admin','coordinator','stranger','ug','pg','jr','fmg','faculty','failed');
insert into auth.sessions(id,user_id) select id,id from senior_test_ids where name in ('admin','coordinator','stranger','ug','pg','jr','fmg','faculty');
insert into public.profiles(id,full_name,batch_id,roll_canonical,phone_e164,fest_id,gender)
select id,'Isolated '||name,pg_temp.sid('batch'),row_number() over(order by name)::text,'+91980000000'||row_number() over(order by name),'SPD-'||upper(substr(replace(id::text,'-',''),1,12)),'male'
from senior_test_ids where name in ('admin','coordinator','stranger','ug');
insert into public.access_records(edition_id,profile_id,state,verified_at)
select pg_temp.sid('edition'),id,'active',now() from senior_test_ids where name in ('admin','coordinator','stranger','ug');
insert into public.staff_assignments(profile_id,role) values(pg_temp.sid('admin'),'main_admin');
insert into public.events(id,edition_id,title,slug,category,format,state,registration_enabled,application_opens_at,application_closes_at,application_questions,eligibility,application_capacity,entry_format)
select id,pg_temp.sid('edition'),'Isolated '||name,'isolated-'||name,'sport',case when name in ('closed','girls') then 'solo'::public.event_format else name::public.event_format end,
  'open',true,now()-interval '1 day',case when name='closed' then now()-interval '1 hour' else now()+interval '1 day' end,
  '[{"key":"slot","label":"Preferred slot","type":"select","required":true,"options":["A","B"]}]',case when name='girls' then '{"division":"girls"}'::jsonb else '{}'::jsonb end,1,'text'
from senior_test_ids where name in ('solo','pair','group','sport','closed','girls');
insert into public.staff_assignments(profile_id,role,event_id) values(pg_temp.sid('coordinator'),'event_coordinator',pg_temp.sid('solo'));

do $$
declare result jsonb; category text; counter integer:=0; event_name text; before_counts bigint[];
begin
  perform pg_temp.claim('admin');
  result:=public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','create','editionId',pg_temp.sid('edition'),'expiresAt',now()+interval '1 day','maxAccounts',4),repeat('a',64));
  if result ? 'token_hash' then raise exception 'Token hash exposed'; end if;
  perform pg_temp.expect_error(format('select public.manage_senior_signup(%L,%L::jsonb)',pg_temp.sid('stranger'),'{"action":"list"}'),'42501');
  foreach category in array array['pg','jr','fmg','faculty'] loop
    counter:=counter+1;
    if not public.check_senior_signup(repeat('a',64),repeat(counter::text,64)) then raise exception 'Valid link rejected'; end if;
    perform public.complete_senior_signup(pg_temp.sid(category),category||'@isolated.invalid',repeat('a',64),repeat(counter::text,64),
      jsonb_build_object('fullName','Isolated '||category,'phone','+91981111111'||counter,'category',category,'department','Test Unit','gender','male'));
    if not exists(select 1 from public.access_records where profile_id=pg_temp.sid(category) and state='active') then raise exception 'Access not immediate'; end if;
    if public.senior_login_identity('+91981111111'||counter)<>category||'@isolated.invalid' then raise exception 'Mobile identity mismatch'; end if;
  end loop;
  if public.check_senior_signup(repeat('a',64),repeat('9',64)) then raise exception 'Quota bypass'; end if;
  perform pg_temp.expect_error(format('select public.complete_senior_signup(%L,%L,%L,%L,%L::jsonb)',pg_temp.sid('failed'),'failed@isolated.invalid',repeat('a',64),repeat('9',64),'{"category":"pg"}'),'22023');
  if exists(select 1 from private.signup_browsers where device_hash=repeat('9',64)) then raise exception 'Failed setup consumed browser'; end if;
  before_counts:=array[(select count(*) from public.applications),(select count(*) from public.participant_groups),(select count(*) from public.pair_invitations),(select count(*) from public.fixtures),(select count(*) from public.result_positions),(select count(*) from public.points_ledger),(select count(*) from public.competition_entries)];
  foreach category in array array['pg','jr','fmg','faculty'] loop
    perform pg_temp.claim(category);
    perform pg_temp.expect_error(format('select public.register_senior_event(%L,%L::jsonb)',pg_temp.sid('solo'),'{}'),'22023');
    perform pg_temp.expect_error(format('select public.register_senior_event(%L,%L::jsonb)',pg_temp.sid('solo'),'{"slot":"unlisted"}'),'22023');
    perform pg_temp.expect_error(format('select public.register_senior_event(%L,%L::jsonb)',pg_temp.sid('solo'),'{"slot":"A","unknown":"answer"}'),'22023');
    foreach event_name in array array['solo','pair','group','sport'] loop
      perform public.register_senior_event(pg_temp.sid(event_name),'{"slot":"A"}','Offline contact details');
      perform public.register_senior_event(pg_temp.sid(event_name),'{"slot":"B"}','Retry must not duplicate or replace');
    end loop;
    perform pg_temp.expect_error(format('select public.apply_to_event(%L,gen_random_uuid(),%L::jsonb)',pg_temp.sid('solo'),'{"slot":"A"}'),'42501');
    perform pg_temp.expect_error(format('select public.pair_invitation_command(%L,%L)',pg_temp.sid('pair'),'invite'),'42501');
    perform pg_temp.expect_error(format('select public.get_team_workspace(%L)',pg_temp.sid('pair')),'42501');
    perform pg_temp.expect_error(format('select public.competition_command(%L,%L,%L::jsonb)',pg_temp.sid('solo'),'entry','{}'),'42501');
    perform pg_temp.expect_error(format('select public.register_senior_event(%L,%L::jsonb)',pg_temp.sid('closed'),'{"slot":"A"}'),'22023');
    perform pg_temp.expect_error(format('select public.register_senior_event(%L,%L::jsonb)',pg_temp.sid('girls'),'{"slot":"A"}'),'42501');
  end loop;
  if before_counts is distinct from array[(select count(*) from public.applications),(select count(*) from public.participant_groups),(select count(*) from public.pair_invitations),(select count(*) from public.fixtures),(select count(*) from public.result_positions),(select count(*) from public.points_ledger),(select count(*) from public.competition_entries)] then raise exception 'Senior entries changed UG operations'; end if;
  if (select count(*) from public.senior_event_registrations)<>16 then raise exception 'Duplicate/missing senior entries'; end if;
  if exists(select 1 from public.senior_event_registrations where answers<>'{"slot":"A"}' or additional_details<>'Offline contact details') then raise exception 'Retry changed confirmed entry'; end if;
  perform pg_temp.claim('ug');
  perform pg_temp.expect_error(format('select public.register_senior_event(%L,%L::jsonb)',pg_temp.sid('solo'),'{"slot":"A"}'),'42501');
  perform public.apply_to_event(pg_temp.sid('solo'),gen_random_uuid(),'{"slot":"A"}');
  if (select count(*) from public.applications where student_id=pg_temp.sid('ug'))<>1 then raise exception 'UG application changed'; end if;
end $$;

-- Actual RLS as end-user roles, not just privileged fixture reads.
set local role authenticated;
select pg_temp.claim('pg');
do $$ begin
  if (select count(*) from public.senior_event_registrations)<>4 then raise exception 'Owner visibility incorrect'; end if;
  perform pg_temp.expect_error('insert into public.senior_event_registrations(event_id,profile_id) values(gen_random_uuid(),gen_random_uuid())','42501');
  perform pg_temp.expect_error('select public.check_senior_signup(''x'',''x'')','42501');
  perform pg_temp.expect_error('select public.manage_senior_signup(null,''{"action":"list"}'')','42501');
end $$;
select pg_temp.claim('stranger');
do $$ begin if exists(select 1 from public.senior_event_registrations) then raise exception 'Private entries leaked'; end if; end $$;
select pg_temp.claim('coordinator');
do $$ begin if (select count(*) from public.senior_event_registrations)<>4 then raise exception 'Coordinator scope incorrect'; end if; end $$;
select pg_temp.claim('admin');
do $$ begin if (select count(*) from public.senior_event_registrations)<>16 then raise exception 'Admin fallback missing'; end if; end $$;
set local role anon;
do $$ begin perform pg_temp.expect_error('select * from public.senior_event_registrations','42501'); end $$;
reset role;

insert into public.polls(id,edition_id,question,opens_at,closes_at,published_at,created_by) values(pg_temp.sid('poll'),pg_temp.sid('edition'),'Isolated poll',now()-interval '1 hour',now()+interval '1 hour',now(),pg_temp.sid('admin'));
set local role service_role;
do $$ begin
  if public.senior_login_identity('+919811111111') is null then raise exception 'Server mobile lookup unavailable'; end if;
  perform public.manage_senior_signup(pg_temp.sid('admin'),'{"action":"list"}');
  perform pg_temp.expect_error(format('select public.complete_senior_signup(%L,%L,%L,%L,%L::jsonb)',pg_temp.sid('failed'),'failed@isolated.invalid',repeat('z',64),repeat('9',64),'{}'),'22023');
end $$;
reset role;
insert into public.poll_options(id,poll_id,label,sort_order) values(pg_temp.sid('option1'),pg_temp.sid('poll'),'One',0),(pg_temp.sid('option2'),pg_temp.sid('poll'),'Two',1);
-- Exercise the same session-bound voting grant used by the browser, not just general polls.
do $$
declare app uuid; entry uuid; poll uuid; option uuid; token text:=repeat('c',64); grant_result jsonb; receipt jsonb;
begin
  perform pg_temp.claim('admin');
  update public.applications set review_state='approved',selection_state='selected',reviewed_at=now(),reviewed_by=pg_temp.sid('admin') where student_id=pg_temp.sid('ug') returning id into app;
  insert into public.competition_entries(event_id,application_id,title,description,submitted_by,state)
    values(pg_temp.sid('solo'),app,'Isolated approved entry','Local voting acceptance',pg_temp.sid('ug'),'approved') returning id into entry;
  insert into public.point_rules(event_id,"placing",points,configured_by) values(pg_temp.sid('solo'),1,0,pg_temp.sid('admin'));
  insert into public.polls(edition_id,event_id,question,opens_at,closes_at,published_at,created_by,competition,round_number)
    values(pg_temp.sid('edition'),pg_temp.sid('solo'),'Isolated competition poll',now()-interval '1 hour',now()+interval '1 hour',now(),pg_temp.sid('admin'),true,1) returning id into poll;
  insert into public.poll_options(poll_id,label,sort_order,entry_id) values(poll,'Isolated entry',0,entry) returning id into option;
  perform pg_temp.claim('fmg');
  grant_result:=public.register_competition_vote_grant(poll,encode(extensions.digest(token,'sha256'),'hex'));
  receipt:=public.cast_competition_vote(token,option);
  if receipt->>'optionId'<>option::text or grant_result->>'expiresAt' is null then raise exception 'Senior competition voting failed'; end if;
  perform pg_temp.claim('jr');
  perform public.register_competition_vote_grant(poll,encode(extensions.digest(repeat('d',64),'sha256'),'hex'));
  perform pg_temp.claim('admin');
  perform public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','suspend','profileId',pg_temp.sid('jr'),'reason','Isolated grant revocation'));
  perform pg_temp.claim('jr');
  perform pg_temp.expect_error(format('select public.cast_competition_vote(%L,%L)',repeat('d',64),option),'42501');
  perform pg_temp.claim('admin');
  perform public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','activate','profileId',pg_temp.sid('jr'),'reason','Isolated grant revocation complete'));
end $$;
do $$
declare category text; vote public.poll_votes; link uuid; quota integer;
begin
  foreach category in array array['pg','jr','fmg','faculty'] loop
    perform pg_temp.claim(category);
    vote:=public.cast_poll_vote(pg_temp.sid('poll'),pg_temp.sid('option1'));
    vote:=public.cast_poll_vote(pg_temp.sid('poll'),pg_temp.sid('option2'));
    if vote.option_id<>pg_temp.sid('option1') then raise exception 'Duplicate vote changed receipt'; end if;
  end loop;
  perform pg_temp.claim('admin');
  perform public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','suspend','profileId',pg_temp.sid('pg'),'reason','Isolated test'));
  perform pg_temp.claim('pg');
  perform pg_temp.expect_error(format('select public.cast_poll_vote(%L,%L)',pg_temp.sid('poll'),pg_temp.sid('option1')),'42501');
  perform pg_temp.expect_error(format('select public.register_senior_event(%L,%L::jsonb)',pg_temp.sid('solo'),'{"slot":"A"}'),'42501');
  perform pg_temp.claim('admin');
  perform public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','activate','profileId',pg_temp.sid('pg'),'reason','Isolated test'));
  select id,used_count into link,quota from private.senior_signup_links;
  perform public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','regenerate','linkId',link,'expiresAt',now()+interval '1 day','maxAccounts',10),repeat('b',64));
  if public.check_senior_signup(repeat('a',64),repeat('9',64)) then raise exception 'Old token valid after regeneration'; end if;
  if public.check_senior_signup(repeat('b',64),repeat('1',64)) then raise exception 'Used browser accepted'; end if;
  perform public.remember_signup_browser(repeat('8',64),pg_temp.sid('ug'));
  if public.check_senior_signup(repeat('b',64),repeat('8',64)) then raise exception 'UG browser accepted'; end if;
  perform public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','reset_browser','profileId',pg_temp.sid('ug'),'reason','Shared browser test'));
  if not public.check_senior_signup(repeat('b',64),repeat('8',64)) then raise exception 'Browser reset failed'; end if;
  perform public.remember_signup_browser(repeat('8',64),pg_temp.sid('ug'));
  update private.signup_browsers set profile_id=null where device_hash=repeat('8',64);
  perform public.remember_signup_browser(repeat('8',64),pg_temp.sid('ug'));
  if not exists(select 1 from private.signup_browsers where device_hash=repeat('8',64) and profile_id=pg_temp.sid('ug')) then raise exception 'Recreated UG profile lost browser ownership'; end if;
  perform pg_temp.expect_error(format('select public.complete_senior_signup(%L,%L,%L,%L,%L::jsonb)',pg_temp.sid('failed'),'failed@isolated.invalid',repeat('b',64),repeat('9',64),jsonb_build_object('fullName','Duplicate phone','phone',(select phone_e164 from public.profiles where id=pg_temp.sid('ug')),'category','pg','department','Test','gender','male')::text),'23505');
  if (select used_count from private.senior_signup_links where id=link)<>quota or exists(select 1 from private.signup_browsers where device_hash=repeat('9',64)) then raise exception 'Failed signup consumed quota/browser'; end if;
  perform pg_temp.expect_error(format('select public.complete_senior_signup(%L,%L,%L,%L,%L::jsonb)',pg_temp.sid('failed'),'failed@isolated.invalid',repeat('b',64),repeat('9',64),'{"fullName":"Invalid","phone":"+919822222222","category":"ug","department":"Test","gender":"male"}'),'22023');
  perform public.manage_senior_signup(pg_temp.sid('admin'),jsonb_build_object('action','close','linkId',link));
  if public.check_senior_signup(repeat('b',64),repeat('9',64)) then raise exception 'Closed link accepted'; end if;
  update private.senior_signup_links set closed_at=null,expires_at=now()-interval '1 second';
  if public.check_senior_signup(repeat('b',64),repeat('9',64)) then raise exception 'Expired link accepted'; end if;
end $$;
rollback;
