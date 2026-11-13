-- Run within BEGIN/ROLLBACK; every probe row must be rolled back.
do $$
declare policy jsonb := '{"themeQuestionKey":"theme","characterQuestionKey":"character","sizes":{"Retro — Solo":1,"Hero & Villain — Duo":2}}';
  eid uuid; edition uuid; students uuid[]; solo uuid; duo1 uuid; duo2 uuid; gid uuid; bad jsonb;
begin
  assert public.theme_registration_size(policy,'{"theme":"Retro — Solo","character":"Retro star"}')=1;
  assert public.theme_registration_size(policy,'{"theme":"Hero & Villain — Duo","character":"Joker"}')=2;
  assert public.theme_registration_size(null,'{}') is null;
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    '{}'::jsonb,'{"theme":"Unknown","character":"A"}'::jsonb,'{"theme":"Retro — Solo","character":" \t\n"}'::jsonb,
    jsonb_build_object('theme','Retro — Solo','character',repeat('x',501)),
    '{"theme":"Retro — Solo","character":123}'::jsonb)) loop
    begin perform public.theme_registration_size(policy,bad); raise exception 'Invalid answer accepted'; exception when sqlstate '22023' then null; end;
  end loop;
  select id into edition from public.editions limit 1;
  select array_agg(id) into students from (select id from public.profiles order by id limit 3) p;
  assert cardinality(students)=3;
  insert into public.events(edition_id,title,slug,category,format,state,operating_method,eligibility,group_min_size,group_max_size)
    values(edition,'Fashion verification probe','fashion-probe-'||gen_random_uuid(),'cultural','group','open','programme',jsonb_build_object('division','open','theme_roster_policy',policy),1,2) returning id into eid;
  begin
    insert into public.applications(event_id,student_id,idempotency_key,answers) values(eid,students[1],gen_random_uuid(),'{}');
    raise exception 'Missing answers accepted';
  exception when sqlstate '22023' then null; end;
  insert into public.applications(event_id,student_id,idempotency_key,review_state,reviewed_at,answers) values
    (eid,students[1],gen_random_uuid(),'approved',now(),'{"theme":"Retro — Solo","character":"Retro star"}') returning id into solo;
  insert into public.applications(event_id,student_id,idempotency_key,review_state,reviewed_at,answers) values
    (eid,students[2],gen_random_uuid(),'approved',now(),'{"theme":"Hero & Villain — Duo","character":"Batman"}') returning id into duo1;
  insert into public.applications(event_id,student_id,idempotency_key,review_state,reviewed_at,answers) values
    (eid,students[3],gen_random_uuid(),'approved',now(),'{"theme":"Hero & Villain — Duo","character":"Joker"}') returning id into duo2;
  insert into public.participant_groups(event_id,name,created_by,captain_id,proposal_ready,proposed_application_ids)
    values(eid,'Solo',students[1],students[1],true,array[solo]) returning id into gid;
  update public.participant_groups set proposal_state='submitted',state='published',published_at=now() where id=gid;
  begin update public.participant_groups set proposed_application_ids=array[solo,duo1] where id=gid; raise exception 'Mixed published roster accepted'; exception when sqlstate '22023' then null; end;
  begin update public.applications set answers='{"theme":"Hero & Villain — Duo","character":"Retro star"}' where id=solo; raise exception 'Assigned theme change accepted'; exception when sqlstate '22023' then null; end;
  insert into public.participant_groups(event_id,name,created_by,captain_id,proposal_ready,proposed_application_ids)
    values(eid,'Duo draft',students[2],students[2],true,array[duo1]) returning id into gid;
  begin update public.participant_groups set proposal_state='submitted' where id=gid; raise exception 'Incomplete duo submitted'; exception when sqlstate '22023' then null; end;
  begin update public.participant_groups set state='published',published_at=now() where id=gid; raise exception 'Incomplete duo published'; exception when sqlstate '22023' then null; end;
  update public.participant_groups set proposed_application_ids=array[duo1,duo2] where id=gid;
  update public.participant_groups set proposal_state='submitted',state='published',published_at=now() where id=gid;
  begin update public.participant_groups set proposed_application_ids=array[duo1] where id=gid; raise exception 'Incomplete published correction accepted'; exception when sqlstate '22023' then null; end;
  begin update public.participant_groups set proposed_application_ids=array[duo1,duo2,solo] where id=gid; raise exception 'Oversized roster accepted'; exception when sqlstate '22023' then null; end;
  -- A non-policy event still accepts its own registration/roster semantics.
  update public.events set eligibility='{"division":"open"}' where id=eid;
  update public.applications set answers='{}' where id=solo;
  update public.participant_groups set proposed_application_ids=array[duo1] where id=gid;
end;
$$;
