-- Derive sports batch scope without changing historical event configuration.
do $$
declare definition text; anchor text;
begin
  definition:=pg_get_functiondef('public.manage_team_proposal(uuid,uuid,text,jsonb)'::regprocedure);
  anchor:='select * into e from public.events where id=p_event_id for update;';
  if position(anchor in definition)=0 then raise exception 'Team workflow contract changed'; end if;
  execute replace(definition,anchor,anchor||E'\n  e.batch_restricted:=e.batch_restricted or e.format=''sport'';');

  definition:=pg_get_functiondef('public.get_team_workspace(uuid)'::regprocedure);
  anchor:='select * into e from public.events where id=p_event_id;';
  if position(anchor in definition)=0 then raise exception 'Team workspace contract changed'; end if;
  execute replace(definition,anchor,anchor||E'\n  e.batch_restricted:=e.batch_restricted or e.format=''sport'';\n  if not e.registration_enabled then raise exception ''This event is informational only'' using errcode=''22023''; end if;');
end;
$$;
