alter table public.result_positions
  add column if not exists winner_roll text;

update public.result_positions position
set winner_roll = profile.roll_canonical
from public.applications application
join public.profiles profile on profile.id = application.student_id
where position.application_id = application.id
  and profile.participant_category = 'ug'
  and position.winner_roll is null;

create or replace function public.publish_unified_results(
  p_event_id uuid,
  p_positions jsonb,
  p_reason text default null,
  p_podium_photo_url text default null,
  p_podium_caption text default null
)
returns public.result_publications language plpgsql security definer set search_path=public as $$
declare
  e public.events; pub public.result_publications; old public.result_publications; pos jsonb;
  bid uuid; aid uuid; gid uuid; place integer; pts integer; winner text; winner_roll text; cat text;
  total integer; ug_count integer; batches_count integer;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then
    raise exception 'Not authorised' using errcode='42501';
  end if;
  select * into e from public.events where id=p_event_id for update;
  if not found or jsonb_typeof(p_positions)<>'array' or jsonb_array_length(p_positions) not between 1 and 100 then
    raise exception 'Invalid results' using errcode='22023';
  end if;
  select * into old from public.result_publications where event_id=p_event_id and state='published' for update;
  if found then
    if nullif(btrim(p_reason),'') is null then
      raise exception 'A correction reason is required' using errcode='22023';
    end if;
    update public.result_publications set state='superseded',superseded_at=now() where id=old.id;
  end if;
  insert into public.result_publications(event_id,version,state,reason,published_by,published_at,podium_photo_url,podium_caption)
  values(p_event_id,(select coalesce(max(version),0)+1 from public.result_publications where event_id=p_event_id),'published',nullif(btrim(p_reason),''),auth.uid(),now(),p_podium_photo_url,p_podium_caption)
  returning * into pub;
  for pos in select value from jsonb_array_elements(p_positions) loop
    bid:=null; winner:=null; winner_roll:=null; cat:=null; pts:=0;
    aid:=nullif(pos->>'applicationId','')::uuid;
    gid:=nullif(pos->>'groupId','')::uuid;
    place:=(pos->>'placing')::integer;
    if place is null or place<1 or (aid is not null and gid is not null) then
      raise exception 'Invalid position' using errcode='22023';
    end if;
    if aid is not null then
      select p.full_name,
        case when p.participant_category='ug' then p.roll_canonical end,
        p.participant_category,
        case when p.participant_category='ug' then p.batch_id end
      into winner,winner_roll,cat,bid
      from public.applications a
      join public.profiles p on p.id=a.student_id
      where a.id=aid and a.event_id=p_event_id and e.format='solo'
        and a.review_state='approved' and a.selection_state='selected';
    elsif gid is not null then
      select name into winner from public.participant_groups
      where id=gid and event_id=p_event_id and state='published' for update;
      select count(*),count(*) filter(where p.participant_category='ug'),count(distinct p.batch_id),(array_agg(p.batch_id))[1]
      into total,ug_count,batches_count,bid
      from public.group_memberships gm
      join public.applications a on a.id=gm.application_id
      join public.profiles p on p.id=a.student_id
      where gm.group_id=gid and gm.removed_at is null;
      if total=0 then winner:=null; end if;
      if total<>ug_count or batches_count<>1 then bid:=null; end if;
      cat:=case when bid is not null then 'ug' else 'mixed' end;
    else
      -- Backward-compatible batch-only entries are accepted only for historical corrections.
      bid:=nullif(pos->>'batchId','')::uuid;
      if old.id is null or not exists(
        select 1 from public.result_positions
        where publication_id=old.id and batch_id=bid and application_id is null and group_id is null
      ) then
        raise exception 'Choose a selected participant or published team' using errcode='22023';
      end if;
      select label into winner from public.batches where id=bid and edition_id=e.edition_id;
      cat:='ug';
    end if;
    if winner is null then
      raise exception 'Winner is not a selected participant for this event' using errcode='22023';
    end if;
    if bid is not null then
      if not exists(select 1 from public.batches where id=bid and edition_id=e.edition_id) then
        raise exception 'Invalid batch edition' using errcode='22023';
      end if;
      select points into pts from public.point_rules where event_id=p_event_id and "placing"=place;
      if not found then
        raise exception 'Configure points for placing %',place using errcode='22023';
      end if;
    end if;
    insert into public.result_positions(
      publication_id,"placing",batch_id,note,winner_name,winner_roll,participant_category,application_id,group_id,awarded_points
    ) values(
      pub.id,place,bid,nullif(pos->>'note',''),winner,winner_roll,cat,aid,gid,pts
    );
    if bid is not null then
      insert into public.points_ledger(publication_id,batch_id,points) values(pub.id,bid,pts)
      on conflict(publication_id,batch_id) do update set points=points_ledger.points+excluded.points;
    end if;
  end loop;
  insert into public.audit_log(actor_id,action,object_type,object_id,reason)
  values(auth.uid(),'results.published','result_publication',pub.id,p_reason);
  return pub;
end $$;

revoke all on function public.publish_unified_results(uuid,jsonb,text,text,text) from public,anon;
grant execute on function public.publish_unified_results(uuid,jsonb,text,text,text) to authenticated;

create or replace function public.unified_event_results(p_event_id uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
  select coalesce(jsonb_agg(row_data order by published_at desc),'[]') from (
    select rp.published_at,jsonb_build_object(
      'publication_id',rp.id,'event_id',e.id,'event_title',e.title,'event_slug',e.slug,'category',e.category,
      'version',rp.version,'state',rp.state,'reason',rp.reason,'published_at',rp.published_at,
      'podium_photo_url',rp.podium_photo_url,'podium_caption',rp.podium_caption,
      'positions',coalesce((
        select jsonb_agg(jsonb_build_object(
          'placing',pos.placing,'batch_id',pos.batch_id,'batch_label',coalesce(b.label,pos.participant_category),
          'winner_name',pos.winner_name,'winner_roll',pos.winner_roll,'participant_category',pos.participant_category,
          'application_id',pos.application_id,'group_id',pos.group_id,'points',pos.awarded_points,'note',pos.note
        ) order by pos.placing)
        from public.result_positions pos
        left join public.batches b on b.id=pos.batch_id
        where pos.publication_id=rp.id
      ),'[]')
    ) as row_data
    from public.result_publications rp
    join public.events e on e.id=rp.event_id
    where (p_event_id is null or e.id=p_event_id) and rp.state='published'
  ) rows;
$$;

revoke all on function public.unified_event_results(uuid) from public,anon;
grant execute on function public.unified_event_results(uuid) to anon,authenticated;

drop function if exists public.get_published_event_results();
create function public.get_published_event_results()
returns table (
  event_id uuid,
  event_title text,
  event_slug text,
  category public.event_category,
  format public.event_format,
  poster_url text,
  publication_id uuid,
  published_at timestamptz,
  podium_photo_url text,
  podium_caption text,
  positions jsonb
)
language sql stable security definer set search_path=public as $$
  select
    e.id,e.title,e.slug,e.category,e.format,e.poster_url,rp.id,rp.published_at,rp.podium_photo_url,rp.podium_caption,
    coalesce(jsonb_agg(jsonb_build_object(
      'placing',pos.placing,'batch_id',pos.batch_id,'batch_label',b.label,'course_label',b.course_label,
      'winner_name',pos.winner_name,'winner_roll',pos.winner_roll,'participant_category',pos.participant_category,
      'application_id',pos.application_id,'group_id',pos.group_id,'points',pos.awarded_points,'note',pos.note
    ) order by pos.placing) filter (where pos.id is not null),'[]'::jsonb)
  from public.result_publications rp
  join public.events e on e.id=rp.event_id
  left join public.result_positions pos on pos.publication_id=rp.id
  left join public.batches b on b.id=pos.batch_id
  where rp.state='published'
  group by e.id,e.title,e.slug,e.category,e.format,e.poster_url,rp.id,rp.published_at,rp.podium_photo_url,rp.podium_caption
  order by rp.published_at desc;
$$;

revoke all on function public.get_published_event_results() from public;
grant execute on function public.get_published_event_results() to anon,authenticated;

notify pgrst,'reload schema';
