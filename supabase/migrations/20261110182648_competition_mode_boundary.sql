create function public.guard_competition_fixture_mode()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.competition_settings where event_id=new.event_id and schedule_mode<>'match') then raise exception 'This event uses sessions or entries, not head-to-head match fixtures' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.guard_competition_fixture_mode() from public,anon,authenticated;
create trigger competition_fixture_mode before insert or update of event_id on public.fixtures for each row execute function public.guard_competition_fixture_mode();

-- New non-match operations use approved registrations, including participants not yet manually selected.
-- Existing sport fixtures retain their selected-player requirement; verified ranking/session guards still run.
do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.publish_unified_results(uuid,jsonb,text,text,text)'::regprocedure);
  definition:=replace(definition,'a.selection_state=''selected''',
    '(a.selection_state=''selected'' or (a.selection_state<>''not_selected'' and exists(select 1 from public.competition_settings cs where cs.event_id=p_event_id and cs.result_mode in (''public_vote'',''time'',''distance'',''count'',''faculty_places''))))');
  execute definition;
  definition:=pg_get_functiondef('public.list_result_participants(uuid)'::regprocedure);
  definition:=replace(definition,'application.selection_state = ''selected''',
    '(application.selection_state = ''selected'' or (application.selection_state<>''not_selected'' and exists(select 1 from public.competition_settings cs where cs.event_id=p_event_id and cs.result_mode in (''public_vote'',''time'',''distance'',''count'',''faculty_places''))))');
  execute definition;
end $migration$;
