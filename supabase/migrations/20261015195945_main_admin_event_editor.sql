create or replace function public.update_admin_event_content(
  p_event_id uuid, p_summary text, p_rules_markdown text, p_venue text,
  p_application_capacity integer, p_application_opens_at timestamptz,
  p_application_closes_at timestamptz, p_reporting_at timestamptz, p_starts_at timestamptz, p_ends_at timestamptz
)
returns public.events language plpgsql security definer set search_path=public as $$
declare updated public.events;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  if coalesce(char_length(btrim(p_summary)),0)>600 or coalesce(char_length(btrim(p_rules_markdown)),0)>20000 then raise exception 'Event content is too long' using errcode='22023'; end if;
  if p_application_closes_at is not null and p_application_opens_at is not null and p_application_closes_at <= p_application_opens_at then raise exception 'Registration closing time must be after opening time' using errcode='22023'; end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then raise exception 'Event end time must be after start time' using errcode='22023'; end if;
  update public.events set summary=btrim(p_summary),rules_markdown=btrim(p_rules_markdown),venue=nullif(btrim(p_venue),''),application_capacity=p_application_capacity,application_opens_at=p_application_opens_at,application_closes_at=p_application_closes_at,reporting_at=p_reporting_at,starts_at=p_starts_at,ends_at=p_ends_at where id=p_event_id returning * into updated;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'event.content_updated','event',updated.id,'{}');
  return updated;
end; $$;
revoke all on function public.update_admin_event_content(uuid,text,text,text,integer,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) from public,anon;
grant execute on function public.update_admin_event_content(uuid,text,text,text,integer,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz) to authenticated;
