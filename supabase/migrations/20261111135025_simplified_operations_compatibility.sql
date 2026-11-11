-- Empty event settings follow an approved event deletion; history-bearing child records still block it.
alter table public.competition_settings drop constraint competition_settings_event_id_fkey;
alter table public.competition_settings add constraint competition_settings_event_id_fkey foreign key(event_id) references public.events(id) on delete cascade;
drop trigger event_operations_setup on public.events;
create trigger event_operations_setup after insert or update of operating_method,registration_enabled on public.events for each row execute function private.initialize_event_operations();
