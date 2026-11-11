alter table public.competition_settings add column measurement_method text not null default 'Official measurement' check(length(btrim(measurement_method)) between 1 and 120);
alter table private.competition_vote_grants drop constraint competition_vote_grants_poll_id_fkey;
alter table private.competition_vote_grants add constraint competition_vote_grants_poll_id_fkey foreign key(poll_id) references public.polls(id) on delete cascade;
alter table private.competition_vote_grants drop constraint competition_vote_grants_profile_id_fkey;
alter table private.competition_vote_grants add constraint competition_vote_grants_profile_id_fkey foreign key(profile_id) references public.profiles(id) on delete cascade;

do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure);
  definition:=replace(definition,'cfg.attempts<>(p_data->>''attempts'')::integer','cfg.measurement_method<>coalesce(p_data->>''measurement_method'',''Official measurement'') or cfg.attempts<>(p_data->>''attempts'')::integer');
  definition:=replace(definition,'updated_at=now();','updated_at=now();
    update public.competition_settings set measurement_method=coalesce(p_data->>''measurement_method'',''Official measurement'') where event_id=e.id;');
  execute definition;
end $migration$;
