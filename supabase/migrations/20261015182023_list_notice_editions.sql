create or replace function public.list_notice_editions()
returns table (edition_id uuid, edition_name text)
language sql
stable
security definer
set search_path = public
as $$
  select editions.id, editions.name
  from public.editions
  where public.can_publish_notices()
    and editions.status <> 'archived'
  order by editions.created_at desc;
$$;

revoke all on function public.list_notice_editions() from public, anon;
grant execute on function public.list_notice_editions() to authenticated;
