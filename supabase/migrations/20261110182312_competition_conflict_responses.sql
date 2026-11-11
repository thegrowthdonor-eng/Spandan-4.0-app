-- A device/version conflict is a domain-level HTTP 409, not a retryable serialization failure.
do $migration$ declare signature text; definition text; begin
  foreach signature in array array['public.prepare_fixture_offline(uuid,uuid)','public.competition_command(uuid,text,jsonb)'] loop
    definition:=replace(pg_get_functiondef(signature::regprocedure),'errcode=''40001''','errcode=''PT409''');
    execute definition;
  end loop;
end $migration$;
