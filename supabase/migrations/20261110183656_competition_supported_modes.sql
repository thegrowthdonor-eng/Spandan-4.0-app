alter table public.competition_settings add constraint competition_supported_modes check(
  (schedule_mode='match' and result_mode='sport_score') or
  (schedule_mode='heat' and result_mode in ('time','count')) or
  (schedule_mode='flight' and result_mode='distance') or
  (schedule_mode='running_order' and result_mode='faculty_places') or
  (schedule_mode='session' and result_mode in ('time','distance','count','faculty_places','public_vote')) or
  (schedule_mode='submission' and result_mode='public_vote') or
  (schedule_mode='information' and result_mode='none')
);

do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.competition_entry_media_guard()'::regprocedure);
  definition:=replace(definition,'and not public.can_manage_event(new.event_id))',
    'and not public.can_manage_event(new.event_id) and not exists(select 1 from public.competition_entries existing where existing.event_id=new.event_id and existing.media_id=new.media_id and existing.application_id is not distinct from new.application_id and existing.group_id is not distinct from new.group_id))');
  execute definition;
end $migration$;
