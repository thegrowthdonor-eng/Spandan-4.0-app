do $migration$ declare definition text; fn text; begin
  definition:=pg_get_functiondef('public.prepare_fixture_offline(uuid,uuid)'::regprocedure);
  definition:=replace(definition,'''eventTitle'', event.title,', '''eventTitle'', event.title, ''operatingMethod'',event.operating_method,');
  execute definition;
  foreach fn in array array['public.list_result_participants(uuid)','private.publish_unified_results(uuid,jsonb,text,text,text)'] loop
    definition:=pg_get_functiondef(fn::regprocedure);
    definition:=replace(definition,'exists(select 1 from public.competition_settings cs where cs.event_id=p_event_id and cs.result_mode in (''public_vote'',''time'',''distance'',''count'',''faculty_places''))',
      'exists(select 1 from public.events op where op.id=p_event_id and op.operating_method in (''results_only'',''fixtures_only'',''voting''))');
    execute definition;
  end loop;
end $migration$;
