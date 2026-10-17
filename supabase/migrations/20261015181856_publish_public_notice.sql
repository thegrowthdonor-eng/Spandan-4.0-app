-- Small, deliberate publishing capability: public notices may only be created by a current main admin.
create or replace function public.publish_public_notice(
  p_edition_id uuid,
  p_title text,
  p_body text,
  p_urgency public.notice_urgency default 'normal',
  p_expires_at timestamptz default null
)
returns public.notices
language plpgsql
security definer
set search_path = public
as $$
declare
  notice public.notices;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.staff_assignments
    where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null
  ) then raise exception 'Not authorised to publish notices' using errcode = '42501'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 or coalesce(char_length(btrim(p_body)), 0) not between 1 and 5000 then
    raise exception 'Invalid notice content' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Expiry must be in the future' using errcode = '22023'; end if;
  insert into public.notices (edition_id, title, body, audience, urgency, publish_at, expires_at, published_by)
  values (p_edition_id, btrim(p_title), btrim(p_body), 'public', p_urgency, now(), p_expires_at, auth.uid())
  returning * into notice;
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'notice_published', 'notice', notice.id, jsonb_build_object('urgency', notice.urgency, 'edition_id', notice.edition_id));
  return notice;
end;
$$;

revoke all on function public.publish_public_notice(uuid, text, text, public.notice_urgency, timestamptz) from public, anon;
grant execute on function public.publish_public_notice(uuid, text, text, public.notice_urgency, timestamptz) to authenticated;
