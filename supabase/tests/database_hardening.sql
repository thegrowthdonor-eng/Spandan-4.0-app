-- Read-only production regression checks. No fictional accounts, votes or results.
begin;
do $test$
declare u uuid;
begin
  select id into u from public.profiles order by created_at limit 1;
  if u is null then raise exception 'An existing profile is required for ownership checks'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
end $test$;
set local role authenticated;
do $test$
begin
  if (select count(*) from public.profiles)<>1 or exists(select 1 from public.profiles where id<>auth.uid()) then raise exception 'Profile RLS isolation failed'; end if;
  if exists(select 1 from public.access_records where profile_id<>auth.uid()) then raise exception 'Access-record isolation failed'; end if;
  if has_function_privilege(current_user,'public.publish_result_positions(uuid,jsonb,text,text,text)','execute')
    or has_function_privilege(current_user,'public.publish_result_positions_v1(uuid,jsonb,text)','execute')
    or has_function_privilege(current_user,'public.delete_student_profile(uuid)','execute') then raise exception 'Legacy/server-only RPC is exposed'; end if;
  if not has_function_privilege(current_user,'public.publish_unified_results(uuid,jsonb,text,text,text,integer)','execute') then raise exception 'Current publisher inaccessible'; end if;
  if has_table_privilege(current_user,'public.profiles','truncate') or has_table_privilege(current_user,'public.poll_votes','insert') then raise exception 'Unnecessary table mutations exposed'; end if;
  perform count(*) from public.merchandise_items;
  perform count(*) from public.sponsors;
end $test$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $test$
begin
  if exists(select 1 from public.profiles) then raise exception 'Anonymous profile access'; end if;
  if has_column_privilege(current_user,'public.poll_options','vote_count','select') then raise exception 'Hidden totals exposed'; end if;
  if has_table_privilege(current_user,'public.result_publications','truncate') then raise exception 'Anonymous truncate privilege'; end if;
  if not has_function_privilege(current_user,'public.cast_competition_vote(text,uuid)','execute') then raise exception 'Direct voting endpoint unavailable'; end if;
  perform public.unified_event_results();
  perform count(*) from public.get_batch_standings();
  perform count(*) from public.merchandise_items;
  perform count(*) from public.sponsors;
  begin
    perform public.cast_competition_vote('invalid',gen_random_uuid());
    raise exception 'Invalid voting capability accepted';
  exception when insufficient_privilege then null; end;
end $test$;
reset role;
rollback;
select 'database hardening read-only regression passed' as result;

begin;
do $test$
declare ids uuid[]; u uuid; admin_expected boolean; expected_merch bigint; expected_sponsors bigint;
begin
  select array_agg(id) into ids from public.profiles;
  foreach u in array ids loop
    perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
    admin_expected:=public.is_main_admin();
    select count(*) into expected_merch from public.merchandise_items where admin_expected or (state in ('published','scheduled') and (publish_at is null or publish_at<=now()));
    select count(*) into expected_sponsors from public.sponsors where admin_expected or (state in ('published','scheduled') and (publish_at is null or publish_at<=now()));
    execute 'set local role authenticated';
    if (select count(*) from public.profiles)<>1 then raise exception 'Ownership check failed'; end if;
    if exists(select 1 from public.profiles where id<>auth.uid()) then raise exception 'Cross-account profile visible'; end if;
    if (select count(*) from public.merchandise_items)<>expected_merch or (select count(*) from public.sponsors)<>expected_sponsors then raise exception 'Publication/admin visibility changed'; end if;
    if public.is_main_admin() is distinct from admin_expected then raise exception 'Admin helper differs under API role'; end if;
    execute 'reset role';
  end loop;
end $test$;
rollback;
select 'all 18 existing identities passed ownership and publication-visibility checks' as result;

