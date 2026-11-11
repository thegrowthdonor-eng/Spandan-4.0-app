do $migration$ declare definition text; injected text; begin
  definition:=pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure);
  injected:='    update public.competition_settings set measurement_method=coalesce(p_data->>''measurement_method'',''Official measurement'') where event_id=e.id;';
  definition:=replace(definition,injected,'');
  definition:=replace(definition,'version=competition_settings.version+1,updated_at=now();','version=competition_settings.version+1,updated_at=now();'||chr(10)||injected);
  definition:=replace(definition,'tally:=greatest(3,',
    'if not exists(select 1 from public.competition_vote_ranking(e.id) r where exists(select 1 from unnest(r.vote_key) v where v>0)) then raise exception ''No eligible entry has votes; schedule a new round rather than selecting an automatic winner'' using errcode=''22023''; end if;
    tally:=greatest(3,');
  execute definition;
end $migration$;
