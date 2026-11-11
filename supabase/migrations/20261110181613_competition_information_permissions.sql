create function private.can_operate_competition(p_event_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and (public.can_manage_event(p_event_id) or exists(select 1 from public.events where id=p_event_id and not registration_enabled and public.can_edit_event_definition(p_event_id)));
$$;
revoke all on function private.can_operate_competition(uuid) from public,anon,authenticated;

create function public.list_competition_events()
returns table(id uuid,title text,category public.event_category,format public.event_format,state public.event_state,score_template text)
language sql stable security definer set search_path=public as $$
  select e.id,e.title,e.category,e.format,e.state,e.score_template from public.events e where private.can_operate_competition(e.id) order by e.title;
$$;
revoke all on function public.list_competition_events() from public,anon;
grant execute on function public.list_competition_events() to authenticated;

do $migration$ declare definition text; signature text; begin
  foreach signature in array array['public.competition_workspace(uuid)','public.competition_command(uuid,text,jsonb)','public.managed_competition_operations()'] loop
    definition:=replace(pg_get_functiondef(signature::regprocedure),'public.can_manage_event(e.id)','private.can_operate_competition(e.id)');
    execute definition;
  end loop;
end $migration$;
