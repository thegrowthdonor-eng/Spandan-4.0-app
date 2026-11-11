do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure);
  definition:=replace(definition,'declare e public.events; cfg','declare before_state jsonb; after_state jsonb; created_sessions jsonb:=''[]''; e public.events; cfg');
  definition:=replace(definition,'  if p_action=''settings'' then',
    '  if p_action in (''settings'',''verify_votes'') then before_state:=to_jsonb(cfg); end if;
  if p_action=''settings'' then');
  definition:=replace(definition,'returning id into sid;',
    'returning id into sid;
      created_sessions:=created_sessions||jsonb_build_array(sid);');
  definition:=replace(definition,'    if s.version<>',
    '    before_state:=jsonb_build_object(''session'',to_jsonb(s),''entrants'',(select coalesce(jsonb_agg(to_jsonb(rows) order by position),''[]'') from public.competition_session_entrants rows where session_id=s.id));
    if s.version<>');
  definition:=replace(definition,'    if found and entry.version<>',
    '    if entry.id is not null then before_state:=to_jsonb(entry); end if;
    if found and entry.version<>');
  definition:=replace(definition,'    if entry.version<>',
    '    before_state:=to_jsonb(entry);
    if entry.version<>');
  definition:=replace(definition,'  insert into public.audit_log(actor_id,action,object_type,object_id,reason,change_summary)',
    '  if p_action in (''session_state'',''session_results'',''session_schedule'',''session_roster'') then
    select jsonb_build_object(''session'',to_jsonb(updated),''entrants'',(select coalesce(jsonb_agg(to_jsonb(rows) order by position),''[]'') from public.competition_session_entrants rows where session_id=updated.id)) into after_state from public.competition_sessions updated where updated.id=s.id;
  elsif p_action in (''entry'',''review_entry'') then
    select to_jsonb(updated) into after_state from public.competition_entries updated where updated.event_id=e.id and (updated.id=entry.id or updated.application_id=app or updated.group_id=grp) limit 1;
  elsif p_action=''sessions'' then after_state:=jsonb_build_object(''created_session_ids'',created_sessions);
  elsif p_action=''voting_round'' then after_state:=jsonb_build_object(''round'',to_jsonb(round));
  else select to_jsonb(updated) into after_state from public.competition_settings updated where updated.event_id=e.id;
  end if;
  insert into public.audit_log(actor_id,action,object_type,object_id,reason,change_summary)');
  definition:=replace(definition,'''entry_id'',p_data->>''entry_id''))','''entry_id'',p_data->>''entry_id'',''before'',before_state,''after'',after_state))');
  execute definition;
end $migration$;

create function public.competition_history(p_event_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(items) order by items.created_at desc),'[]') from (
    select a.id,a.action,a.reason,a.created_at,p.full_name as actor,a.change_summary from public.audit_log a left join public.profiles p on p.id=a.actor_id
    where a.object_type='event' and a.object_id=p_event_id and a.action like 'competition.%' and private.can_operate_competition(p_event_id)
    order by a.created_at desc,a.id desc limit 30
  ) items;
$$;
revoke all on function public.competition_history(uuid) from public,anon;
grant execute on function public.competition_history(uuid) to authenticated;
