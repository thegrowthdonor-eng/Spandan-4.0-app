do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.prepare_fixture_offline(uuid,uuid)'::regprocedure);
  definition:=regexp_replace(definition,'errcode[[:space:]]*=[[:space:]]*''40001''','errcode=''PT409''','g');
  execute definition;
end $migration$;
