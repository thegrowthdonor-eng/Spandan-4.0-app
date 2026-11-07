-- Migration: Add delete_fixture RPC for fixture deletion and cascade cleanup
create or replace function public.delete_fixture(p_fixture_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_fixture public.fixtures;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select * into target_fixture
  from public.fixtures
  where id = p_fixture_id
  for update;

  if not found then
    raise exception 'Fixture not found' using errcode = 'P0002';
  end if;

  if not public.can_manage_event(target_fixture.event_id) then
    raise exception 'Not authorised to manage this fixture' using errcode = '42501';
  end if;

  delete from public.fixtures where id = p_fixture_id;

  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (
    auth.uid(),
    'fixture.deleted',
    'fixture',
    p_fixture_id,
    jsonb_build_object(
      'event_id', target_fixture.event_id,
      'stage', target_fixture.stage,
      'participant_a', target_fixture.participant_a_label,
      'participant_b', target_fixture.participant_b_label
    )
  );

  return true;
end;
$$;

revoke all on function public.delete_fixture(uuid) from public, anon;
grant execute on function public.delete_fixture(uuid) to authenticated, service_role;

