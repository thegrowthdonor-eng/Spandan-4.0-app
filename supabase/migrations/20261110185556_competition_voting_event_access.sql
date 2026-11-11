do $migration$ declare definition text; guard text; begin
  guard:='if p.competition and not exists(select 1 from public.events e join public.editions ed on ed.id=e.edition_id where e.id=p.event_id and e.state not in (''draft'',''cancelled'',''completed'') and ed.status=''published'') then raise exception ''Voting event unavailable'' using errcode=''22023''; end if;';
  definition:=pg_get_functiondef('public.competition_vote_guard()'::regprocedure);
  definition:=replace(definition,'if p.competition and (',guard||chr(10)||'  if p.competition and (');
  execute definition;
  definition:=pg_get_functiondef('public.register_competition_vote_grant(uuid,text)'::regprocedure);
  definition:=replace(definition,'if not found or p.published_at is null',
    'if p.id is not null and not exists(select 1 from public.events e join public.editions ed on ed.id=e.edition_id where e.id=p.event_id and e.state not in (''draft'',''cancelled'',''completed'') and ed.status=''published'') then raise exception ''Voting event unavailable'' using errcode=''22023''; end if;
  if not found or p.published_at is null');
  execute definition;
end $migration$;
