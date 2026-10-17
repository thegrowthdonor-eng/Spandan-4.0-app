create or replace function public.set_admin_event_state(p_event_id uuid, p_state public.event_state)
returns public.events language plpgsql security definer set search_path = public as $$
declare event_record public.events;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  select * into event_record from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if p_state not in ('published','open','closed','cancelled') then raise exception 'Invalid event lifecycle action' using errcode='22023'; end if;
  if p_state in ('published','open') and (btrim(event_record.summary)='' or event_record.venue is null or btrim(event_record.rules_markdown)='') then
    raise exception 'Add summary, venue and rules before publishing' using errcode='22023';
  end if;
  if p_state='open' and (event_record.application_opens_at is null or event_record.application_closes_at is null) then
    raise exception 'Set the registration opening and closing times before opening applications' using errcode='22023';
  end if;
  update public.events set state=p_state where id=p_event_id returning * into event_record;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
  values(auth.uid(),'event.state_changed','event',event_record.id,jsonb_build_object('state',p_state));
  return event_record;
end; $$;
revoke all on function public.set_admin_event_state(uuid,public.event_state) from public,anon;
grant execute on function public.set_admin_event_state(uuid,public.event_state) to authenticated;
