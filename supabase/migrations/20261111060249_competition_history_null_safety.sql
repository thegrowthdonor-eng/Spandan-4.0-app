create or replace function public.competition_history(p_event_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(to_jsonb(items) order by items.created_at desc),'[]') from (
    select a.id,a.action,a.reason,a.created_at,p.full_name as actor,
      a.change_summary||jsonb_build_object(
        'before',case when jsonb_typeof(a.change_summary->'before')='object' then (a.change_summary->'before')-'entrants'-'description' else null end,
        'after',case when jsonb_typeof(a.change_summary->'after')='object' then (a.change_summary->'after')-'entrants'-'description' else null end
      ) as change_summary
    from public.audit_log a left join public.profiles p on p.id=a.actor_id
    where a.object_type='event' and a.object_id=p_event_id and a.action like 'competition.%' and private.can_operate_competition(p_event_id)
    order by a.created_at desc,a.id desc limit 30
  ) items;
$$;
