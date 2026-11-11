create index competition_grants_poll on private.competition_vote_grants(poll_id);
create index competition_grants_profile on private.competition_vote_grants(profile_id);
create index competition_entries_application_fk on public.competition_entries(application_id);
create index competition_entries_group_fk on public.competition_entries(group_id);
create index competition_entries_actor_fk on public.competition_entries(submitted_by);
create index competition_entries_media_fk on public.competition_entries(media_id);
create index competition_placements_entry_fk on public.competition_placements(entry_id);
create index competition_entrants_application_fk on public.competition_session_entrants(application_id);
create index competition_entrants_group_fk on public.competition_session_entrants(group_id);
create index competition_sessions_programme_fk on public.competition_sessions(schedule_entry_id);
alter table public.competition_sessions add column updated_at timestamptz not null default now();
create trigger competition_session_updated before update on public.competition_sessions for each row execute function public.touch_updated_at();

do $migration$ begin
  execute replace(pg_get_functiondef('public.competition_workspace(uuid)'::regprocedure),
    '''placements'',case when staff',
    '''programme'',case when staff then (select coalesce(jsonb_agg(jsonb_build_object(''id'',p.id,''title'',p.title,''starts_at'',p.starts_at) order by p.day,p.sort_order),''[]'') from public.schedule_entries p where p.edition_id=e.edition_id and p.published) else ''[]''::jsonb end,
    ''placements'',case when staff');
end $migration$;

create function public.public_competition_live()
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(items) order by items.starts_at),'[]') from (
    select s.id,s.event_id,e.title as event_title,s.title,s.venue,s.starts_at,s.ends_at,s.state,s.updated_at,s.schedule_entry_id,
      case when s.current_position is not null then 'Current: '||(select label from public.competition_session_entrants where session_id=s.id and position=s.current_position)
        when s.state='completed' then 'Confirmed results available in the competition workspace' else null end as update_note
    from public.competition_sessions s join public.events e on e.id=s.event_id join public.editions ed on ed.id=e.edition_id
    where ed.status='published' and e.state not in ('draft','cancelled') and s.state<>'draft' order by s.starts_at limit 100
  ) items;
$$;
revoke all on function public.public_competition_live() from public;
grant execute on function public.public_competition_live() to anon,authenticated;
