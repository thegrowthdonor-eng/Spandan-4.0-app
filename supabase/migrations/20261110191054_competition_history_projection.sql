create index competition_event_audit_history on public.audit_log(object_id,created_at desc) where object_type='event';

create or replace function public.competition_history(p_event_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(items) order by items.created_at desc),'[]') from (
    select a.id,a.action,a.reason,a.created_at,p.full_name as actor,
      a.change_summary||jsonb_build_object('before',(a.change_summary->'before')-'entrants'-'description','after',(a.change_summary->'after')-'entrants'-'description') as change_summary
    from public.audit_log a left join public.profiles p on p.id=a.actor_id
    where a.object_type='event' and a.object_id=p_event_id and a.action like 'competition.%' and private.can_operate_competition(p_event_id)
    order by a.created_at desc,a.id desc limit 30
  ) items;
$$;
create function public.competition_history_detail(p_event_id uuid,p_history_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',a.id,'action',a.action,'reason',a.reason,'created_at',a.created_at,'actor',p.full_name,'change_summary',a.change_summary)
  from public.audit_log a left join public.profiles p on p.id=a.actor_id where a.id=p_history_id and a.object_type='event' and a.object_id=p_event_id and a.action like 'competition.%' and private.can_operate_competition(p_event_id);
$$;
revoke all on function public.competition_history_detail(uuid,uuid) from public,anon;
grant execute on function public.competition_history_detail(uuid,uuid) to authenticated;

do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure);
  definition:=replace(definition,'created_sessions jsonb:=''[]'';','created_sessions jsonb:=''[]''; previous_rows jsonb; saved_rows jsonb;');
  definition:=replace(definition,'    for item in select value from jsonb_array_elements(p_data->''sessions'') loop',
    '    for item in select value from jsonb_array_elements(p_data->''sessions'') loop
      if jsonb_typeof(item->''entrants'') is distinct from ''array'' or jsonb_array_length(item->''entrants'')>200 then raise exception ''A session supports up to 200 entrants; split larger fields into explicit groups'' using errcode=''22023''; end if;');
  definition:=replace(definition,'or jsonb_typeof(p_data->''entrants'') is distinct from ''array'' then',
    'or jsonb_typeof(p_data->''entrants'') is distinct from ''array'' or coalesce(jsonb_array_length(p_data->''entrants''),201)>200 then');
  definition:=replace(definition,'        update public.competition_session_entrants set status=item->>''status''',
    '        if coalesce(nullif(item->>''placing'','''')::integer,0)>jsonb_array_length(p_data->''results'') then raise exception ''Official placing exceeds the session field'' using errcode=''22023''; end if;
        update public.competition_session_entrants set status=item->>''status''');
  definition:=replace(definition,'  insert into public.audit_log(actor_id,action,object_type,object_id,reason,change_summary)',
    '  if before_state ? ''entrants'' and after_state ? ''entrants'' then
    previous_rows:=before_state->''entrants''; saved_rows:=after_state->''entrants'';
    before_state:=jsonb_set(before_state,''{entrants}'',(select coalesce(jsonb_agg(prior_rows.value order by (prior_rows.value->>''position'')::integer),''[]'') from jsonb_array_elements(previous_rows) prior_rows(value) where not exists(select 1 from jsonb_array_elements(saved_rows) later_rows(value) where later_rows.value=prior_rows.value)));
    after_state:=jsonb_set(after_state,''{entrants}'',(select coalesce(jsonb_agg(later_rows.value order by (later_rows.value->>''position'')::integer),''[]'') from jsonb_array_elements(saved_rows) later_rows(value) where not exists(select 1 from jsonb_array_elements(previous_rows) prior_rows(value) where prior_rows.value=later_rows.value)));
  end if;
  insert into public.audit_log(actor_id,action,object_type,object_id,reason,change_summary)');
  execute definition;
end $migration$;
