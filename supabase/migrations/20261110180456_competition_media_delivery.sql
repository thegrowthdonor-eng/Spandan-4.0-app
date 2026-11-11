create function public.public_media_urls(p_keys text[])
returns table(object_key text,public_url text)
language sql stable security definer set search_path=public as $$
  select m.object_key,m.public_url from public.media_assets m where m.state='public' and m.object_key=any(p_keys) and cardinality(p_keys)<=1000;
$$;
revoke all on function public.public_media_urls(text[]) from public;
grant execute on function public.public_media_urls(text[]) to anon,authenticated;

create or replace function public.attach_event_poster(p_event_id uuid,p_path text,p_url text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.can_edit_event_definition(p_event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
  perform 1 from public.events where id=p_event_id for update;
  if p_path is null or p_url is null or p_path not like 'posters/'||p_event_id::text||'/%' or not (
    (right(p_path,5)='.webp' and p_url like 'https://%/storage/v1/object/public/fest-media/'||p_path and exists(select 1 from storage.objects where bucket_id='fest-media' and name=p_path)) or
    exists(select 1 from public.media_assets m where m.object_key=p_path and m.event_id=p_event_id and m.owner_id=auth.uid() and m.state='public' and m.purpose='posters' and m.public_url=p_url)
  ) then raise exception 'Invalid uploaded poster' using errcode='22023'; end if;
  update public.events set poster_url=p_url where id=p_event_id;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'event.poster_attached','event',p_event_id,jsonb_build_object('storage_path',p_path));
end $$;

-- Keep the shared command's validation in one place while preserving already-applied migration history.
do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure);
  definition:=replace(definition,
    'if p_data->>''state''=''live'' and s.actual_started_at is null then',
    'if p_data->>''state''=''live'' and s.state=''draft'' then raise exception ''Publish the draft schedule before starting'' using errcode=''22023''; end if;
      if p_data->>''state''=''live'' and s.actual_started_at is null then');
  definition:=replace(definition,
    'if p_data->>''state''=''approved'' then perform private.competition_entrant',
    'if p_data->>''state''=''approved'' and entry.state not in (''submitted'',''approved'') then raise exception ''Only a submitted entry can be approved'' using errcode=''22023''; end if;
    if p_data->>''state''=''approved'' then perform private.competition_entrant');
  definition:=replace(definition,
    'if exists(select 1 from public.polls p where p.event_id=e.id and p.competition and not exists(select 1 from public.poll_votes where poll_id=p.id))',
    'if exists(select 1 from public.polls p where p.event_id=e.id and p.competition and not exists(select 1 from public.poll_votes where poll_id=p.id) and not exists(
      select 1 from public.polls later where later.event_id=e.id and later.competition and later.round_number>p.round_number and exists(select 1 from public.poll_votes where poll_id=later.id)
      and (select array_agg(entry_id order by entry_id) from public.poll_options where poll_id=later.id)=(select array_agg(entry_id order by entry_id) from public.poll_options where poll_id=p.id)))');
  execute definition;
end $migration$;

notify pgrst,'reload schema';
