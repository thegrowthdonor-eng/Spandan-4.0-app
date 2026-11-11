create function public.managed_competition_operations()
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'event_id',s.event_id,'event_title',e.title,'title',s.title,'venue',s.venue,'starts_at',s.starts_at,'state',s.state,'version',s.version,'actual_started_at',s.actual_started_at) order by s.starts_at),'[]') from public.competition_sessions s join public.events e on e.id=s.event_id where s.state not in ('draft','cancelled','completed') and public.can_manage_event(e.id) and auth.uid() is not null),
    'voting',(select coalesce(jsonb_agg(jsonb_build_object('event_id',s.event_id,'event_title',e.title,'verified',s.verified,'pending',(select count(*) from public.competition_entries where event_id=e.id and state='submitted')) order by e.title),'[]') from public.competition_settings s join public.events e on e.id=s.event_id where s.result_mode='public_vote' and public.can_manage_event(e.id) and auth.uid() is not null));
$$;
revoke all on function public.managed_competition_operations() from public,anon;
grant execute on function public.managed_competition_operations() to authenticated;

create function public.public_competition_schedule()
returns table(id uuid,event_id uuid,event_title text,edition_id uuid,title text,venue text,starts_at timestamptz,reporting_at timestamptz,ends_at timestamptz,state text,schedule_entry_id uuid)
language sql stable security definer set search_path=public as $$
  select s.id,s.event_id,e.title,e.edition_id,s.title,s.venue,s.starts_at,s.reporting_at,s.ends_at,s.state,s.schedule_entry_id from public.competition_sessions s join public.events e on e.id=s.event_id where e.state not in ('draft','cancelled') and s.state<>'draft' order by s.starts_at;
$$;
revoke all on function public.public_competition_schedule() from public;
grant execute on function public.public_competition_schedule() to anon,authenticated;
