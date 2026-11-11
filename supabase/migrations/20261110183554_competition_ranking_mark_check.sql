do $migration$ begin
  execute replace(pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure),
    'unnest(r.vote_key) v where v>0','unnest(r.vote_key) as marks(value) where marks.value>0');
end $migration$;
