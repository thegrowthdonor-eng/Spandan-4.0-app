create or replace function public.list_admin_event_editor_data()
returns table (event_id uuid,title text,state public.event_state,summary text,rules_markdown text,venue text,application_capacity integer,application_opens_at timestamptz,application_closes_at timestamptz,reporting_at timestamptz,starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path=public as $$
 select id,title,state,summary,rules_markdown,venue,application_capacity,application_opens_at,application_closes_at,reporting_at,starts_at,ends_at from public.events where public.is_main_admin() order by title;
$$;
revoke all on function public.list_admin_event_editor_data() from public,anon;
grant execute on function public.list_admin_event_editor_data() to authenticated;
