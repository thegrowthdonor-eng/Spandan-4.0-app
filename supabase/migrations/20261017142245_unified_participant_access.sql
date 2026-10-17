-- Additive participant access. Existing UG identifiers and passwords are unchanged.
alter table public.profiles add column participant_category text not null default 'ug'
  check (participant_category in ('ug','pg','jr','faculty'));
alter table public.profiles add column department text;
alter table public.profiles alter column batch_id drop not null;
alter table public.profiles alter column roll_canonical drop not null;
alter table public.profiles add constraint participant_credentials check (
 (participant_category='ug' and batch_id is not null and roll_canonical is not null)
 or (participant_category<>'ug' and batch_id is null and roll_canonical is null and length(btrim(department)) between 1 and 120));
create unique index senior_mobile_unique on public.profiles(phone_e164) where participant_category<>'ug';

-- Only missing requested MBBS cohorts are inserted; existing rows are never renamed.
insert into public.batches(edition_id,label,course_label,eligible)
select e.id,y.label,'MBBS',true from public.editions e
cross join (values ('2021'),('2022'),('2023'),('2024'),('2025'),('2026')) y(label)
where e.status <> 'archived' and not exists (
 select 1 from public.batches b where b.edition_id=e.id and b.label=y.label);

create table private.senior_invites (
 id uuid primary key default gen_random_uuid(),
 edition_id uuid not null references public.editions(id),
 full_name text not null check(length(btrim(full_name)) between 1 and 100),
 phone text not null unique check(phone ~ '^\+91[6-9][0-9]{9}$'),
 category text not null check(category in ('pg','jr','faculty')),
 department text not null check(length(btrim(department)) between 1 and 120),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 issued_by uuid not null references public.profiles(id),
 expires_at timestamptz not null default now()+interval '48 hours',
 used_at timestamptz, revoked_at timestamptz,
 profile_id uuid unique references public.profiles(id),
 created_at timestamptz not null default now()
);
create table private.senior_login (
 profile_id uuid primary key references public.profiles(id),
 phone text not null unique,
 auth_email text not null unique
);
alter table private.senior_invites enable row level security;
alter table private.senior_login enable row level security;
revoke all on private.senior_invites,private.senior_login from public,anon,authenticated;

-- Service-only entrypoints: actor is obtained from getUser(), never from the request body.
create function public.manage_senior_invite(p_actor uuid,p_payload jsonb,p_hash text default null)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare r private.senior_invites; action text:=p_payload->>'action';
begin
 if not exists(select 1 from public.staff_assignments where profile_id=p_actor and role='main_admin' and revoked_at is null)
 then raise exception 'Main Admin required' using errcode='42501'; end if;
 if action='list' then
  return coalesce((select jsonb_agg(to_jsonb(i)-'token_hash' order by created_at desc) from private.senior_invites i),'[]');
 end if;
 if action='issue' then
  if exists(select 1 from private.senior_login where phone=p_payload->>'phone') then raise exception 'Account already exists; use recovery' using errcode='22023'; end if;
  if not exists(select 1 from public.editions where id=(p_payload->>'editionId')::uuid and status<>'archived') then raise exception 'Choose a current edition' using errcode='22023'; end if;
  insert into private.senior_invites(edition_id,full_name,phone,category,department,token_hash,issued_by)
  values((p_payload->>'editionId')::uuid,p_payload->>'fullName',p_payload->>'phone',p_payload->>'category',p_payload->>'department',p_hash,p_actor)
  returning * into r;
 elsif action in ('reissue','revoke') then
  select * into r from private.senior_invites where id=(p_payload->>'inviteId')::uuid for update;
  if not found or r.profile_id is not null then raise exception 'Invite unavailable; use account recovery' using errcode='22023'; end if;
  -- Do not race an in-flight redemption; a failed attempt can be reissued after five minutes.
  if r.used_at > now()-interval '5 minutes' then raise exception 'Setup in progress; retry after five minutes' using errcode='22023'; end if;
  if action='revoke' then update private.senior_invites set revoked_at=now() where id=r.id returning * into r;
  else update private.senior_invites set token_hash=p_hash,issued_by=p_actor,expires_at=now()+interval '48 hours',used_at=null,revoked_at=null where id=r.id returning * into r; end if;
 elsif action='update' then
  select * into r from private.senior_invites where profile_id=(p_payload->>'profileId')::uuid for update;
  if not found then raise exception 'Senior account not found' using errcode='22023'; end if;
  update public.profiles set phone_e164=p_payload->>'phone',participant_category=p_payload->>'category',department=p_payload->>'department' where id=r.profile_id;
  update private.senior_login set phone=p_payload->>'phone' where profile_id=r.profile_id;
  update private.senior_invites set phone=p_payload->>'phone',category=p_payload->>'category',department=p_payload->>'department' where id=r.id returning * into r;
 else raise exception 'Unknown action' using errcode='22023'; end if;
 insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
 values(p_actor,'senior.'||action,'senior_invite',r.id,jsonb_build_object('category',r.category));
 return to_jsonb(r)-'token_hash';
end $$;

create function public.claim_senior_invite(p_hash text)
returns jsonb language plpgsql security definer set search_path=public,private as $$
declare r private.senior_invites;
begin
 select * into r from private.senior_invites where token_hash=p_hash for update;
 if not found or r.used_at is not null or r.revoked_at is not null or r.expires_at<=now() or r.profile_id is not null then return null; end if;
 update private.senior_invites set used_at=now() where id=r.id;
 return jsonb_build_object('id',r.id);
end $$;

create function public.complete_senior_invite(p_hash text,p_user uuid,p_email text)
returns void language plpgsql security definer set search_path=public,private as $$
declare r private.senior_invites;
begin
 select * into r from private.senior_invites where token_hash=p_hash for update;
 if not found or r.used_at is null or r.revoked_at is not null or r.expires_at<=now() or r.profile_id is not null
 then raise exception 'Invite unavailable' using errcode='22023'; end if;
 if not exists(select 1 from auth.users where id=p_user and email=p_email) then raise exception 'Identity mismatch' using errcode='22023'; end if;
 insert into public.profiles(id,full_name,phone_e164,fest_id,participant_category,department)
 values(p_user,r.full_name,r.phone,'SPD-'||upper(substr(replace(p_user::text,'-',''),1,12)),r.category,r.department);
 insert into private.senior_login(profile_id,phone,auth_email) values(p_user,r.phone,p_email);
 insert into public.access_records(edition_id,profile_id,state,verified_by,verified_at,reason)
 values(r.edition_id,p_user,'active',r.issued_by,now(),'Committee verified personal invitation');
 update private.senior_invites set profile_id=p_user where id=r.id;
 insert into public.audit_log(actor_id,action,object_type,object_id) values(p_user,'senior.activated','profile',p_user);
end $$;

create function public.senior_login_identity(p_phone text)
returns text language sql stable security definer set search_path=private as $$
 select auth_email from private.senior_login where phone=p_phone;
$$;

revoke all on function public.manage_senior_invite(uuid,jsonb,text),public.claim_senior_invite(text),public.complete_senior_invite(text,uuid,text),public.senior_login_identity(text) from public,anon,authenticated;
grant execute on function public.manage_senior_invite(uuid,jsonb,text),public.claim_senior_invite(text),public.complete_senior_invite(text,uuid,text),public.senior_login_identity(text) to service_role;

-- Preserve installed RPC signatures while allowing batch-less profiles in operational lists.
do $$
declare f record; definition text;
begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
 'list_committee_candidates','list_committee_members','list_event_review_queue',
 'list_event_selection_queue','list_group_selection_candidates','list_event_participant_groups',
 'list_activation_queue','list_admin_help_threads')
 loop
  definition:=pg_get_functiondef(f.oid);
  definition:=regexp_replace(definition,'(?<!left )join public.batches b on b.id\s*=\s*p.batch_id','left join public.batches b on b.id = p.batch_id','gi');
  definition:=replace(definition,'b.label,','coalesce(b.label, upper(p.participant_category)),');
  definition:=replace(definition,'b.course_label,','coalesce(b.course_label, p.department),');
  execute definition;
 end loop;
end $$;
notify pgrst,'reload schema';

-- Results retain a participant snapshot; only verified UG membership can earn batch points.
alter table public.result_publications add column if not exists podium_photo_url text;
alter table public.result_publications add column if not exists podium_caption text;
alter table public.result_positions alter column batch_id drop not null;
alter table public.result_positions add column winner_name text;
alter table public.result_positions add column participant_category text;
alter table public.result_positions add column application_id uuid references public.applications(id);
alter table public.result_positions add column group_id uuid references public.participant_groups(id);
alter table public.result_positions add column awarded_points integer not null default 0 check(awarded_points>=0);
update public.result_positions r set winner_name=b.label,participant_category='ug',awarded_points=coalesce(l.points,0)
from public.batches b left join public.points_ledger l on l.batch_id=b.id
where r.batch_id=b.id and l.publication_id=r.publication_id;
alter table public.result_positions drop constraint if exists result_positions_publication_id_batch_id_key;
create unique index result_unique_application on public.result_positions(publication_id,application_id) where application_id is not null;
create unique index result_unique_group on public.result_positions(publication_id,group_id) where group_id is not null;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='public.result_publications'::regclass and contype='c'
 and pg_get_constraintdef(oid) like '%published_at%' and pg_get_constraintdef(oid) not like '%superseded_at%'
 loop execute format('alter table public.result_publications drop constraint %I',c.conname); end loop;
end $$;
alter table public.result_publications add constraint publication_timestamp check ((state in ('published','superseded'))=(published_at is not null));

create function public.list_result_participants(p_event_id uuid)
returns table(target_id uuid,target_kind text,label text,category text,batch_id uuid)
language sql stable security definer set search_path=public as $$
 select a.id,'application',p.full_name||' · '||coalesce(b.label,upper(p.participant_category)),p.participant_category,p.batch_id
 from public.applications a join public.profiles p on p.id=a.student_id left join public.batches b on b.id=p.batch_id
 join public.events e on e.id=a.event_id
 where a.event_id=p_event_id and e.format='solo' and a.review_state='approved' and a.selection_state='selected' and public.can_manage_event(p_event_id)
 union all
 select g.id,'group',g.name,'group',g.batch_id from public.participant_groups g
 where g.event_id=p_event_id and g.state='published' and public.can_manage_event(p_event_id);
$$;

create function public.publish_unified_results(p_event_id uuid,p_positions jsonb,p_reason text default null,p_podium_photo_url text default null,p_podium_caption text default null)
returns public.result_publications language plpgsql security definer set search_path=public as $$
declare e public.events; pub public.result_publications; old public.result_publications; pos jsonb;
 bid uuid; aid uuid; gid uuid; place integer; pts integer; winner text; cat text; total integer; ug_count integer; batches_count integer;
begin
 if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
 select * into e from public.events where id=p_event_id for update;
 if not found or jsonb_typeof(p_positions)<>'array' or jsonb_array_length(p_positions) not between 1 and 100 then raise exception 'Invalid results' using errcode='22023'; end if;
 select * into old from public.result_publications where event_id=p_event_id and state='published' for update;
 if found then
  if nullif(btrim(p_reason),'') is null then raise exception 'A correction reason is required' using errcode='22023'; end if;
  update public.result_publications set state='superseded',superseded_at=now() where id=old.id;
 end if;
 insert into public.result_publications(event_id,version,state,reason,published_by,published_at,podium_photo_url,podium_caption)
 values(p_event_id,(select coalesce(max(version),0)+1 from public.result_publications where event_id=p_event_id),'published',nullif(btrim(p_reason),''),auth.uid(),now(),p_podium_photo_url,p_podium_caption) returning * into pub;
 for pos in select value from jsonb_array_elements(p_positions) loop
  bid:=null; winner:=null; cat:=null; pts:=0;
  aid:=nullif(pos->>'applicationId','')::uuid; gid:=nullif(pos->>'groupId','')::uuid; place:=(pos->>'placing')::integer;
  if place is null or place<1 or (aid is not null and gid is not null) then raise exception 'Invalid position' using errcode='22023'; end if;
  if aid is not null then
   select p.full_name,p.participant_category,case when p.participant_category='ug' then p.batch_id end into winner,cat,bid
   from public.applications a join public.profiles p on p.id=a.student_id
   where a.id=aid and a.event_id=p_event_id and e.format='solo' and a.review_state='approved' and a.selection_state='selected';
  elsif gid is not null then
   select name into winner from public.participant_groups where id=gid and event_id=p_event_id and state='published' for update;
   select count(*),count(*) filter(where p.participant_category='ug'),count(distinct p.batch_id),(array_agg(p.batch_id))[1]
   into total,ug_count,batches_count,bid from public.group_memberships gm join public.applications a on a.id=gm.application_id
   join public.profiles p on p.id=a.student_id where gm.group_id=gid and gm.removed_at is null;
   if total=0 then winner:=null; end if;
   if total<>ug_count or batches_count<>1 then bid:=null; end if;
   cat:=case when bid is not null then 'ug' else 'mixed' end;
  else
   -- Backward-compatible batch-only entries are accepted only for historical corrections.
   bid:=nullif(pos->>'batchId','')::uuid;
   if old.id is null or not exists(select 1 from public.result_positions where publication_id=old.id and batch_id=bid and application_id is null and group_id is null) then
    raise exception 'Choose a selected participant or published team' using errcode='22023';
   end if;
   select label into winner from public.batches where id=bid and edition_id=e.edition_id; cat:='ug';
  end if;
  if winner is null then raise exception 'Winner is not a selected participant for this event' using errcode='22023'; end if;
  if bid is not null then
   if not exists(select 1 from public.batches where id=bid and edition_id=e.edition_id) then raise exception 'Invalid batch edition' using errcode='22023'; end if;
   select points into pts from public.point_rules where event_id=p_event_id and "placing"=place;
   if not found then raise exception 'Configure points for placing %',place using errcode='22023'; end if;
  end if;
  insert into public.result_positions(publication_id,"placing",batch_id,note,winner_name,participant_category,application_id,group_id,awarded_points)
  values(pub.id,place,bid,nullif(pos->>'note',''),winner,cat,aid,gid,pts);
  if bid is not null then
   insert into public.points_ledger(publication_id,batch_id,points) values(pub.id,bid,pts)
   on conflict(publication_id,batch_id) do update set points=points_ledger.points+excluded.points;
  end if;
 end loop;
 insert into public.audit_log(actor_id,action,object_type,object_id,reason)
 values(auth.uid(),'results.published','result_publication',pub.id,p_reason);
 return pub;
end $$;

create function public.unified_event_results(p_event_id uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(row_data order by published_at desc),'[]') from (
 select rp.published_at,jsonb_build_object(
 'publication_id',rp.id,'event_id',e.id,'event_title',e.title,'event_slug',e.slug,'category',e.category,
 'version',rp.version,'state',rp.state,'reason',rp.reason,'published_at',rp.published_at,
 'podium_photo_url',rp.podium_photo_url,'podium_caption',rp.podium_caption,
 'positions',coalesce((select jsonb_agg(jsonb_build_object('placing',pos.placing,'batch_id',pos.batch_id,
 'batch_label',coalesce(b.label,pos.participant_category),'winner_name',pos.winner_name,'participant_category',pos.participant_category,
 'application_id',pos.application_id,'group_id',pos.group_id,'points',pos.awarded_points,'note',pos.note) order by pos.placing)
 from public.result_positions pos left join public.batches b on b.id=pos.batch_id where pos.publication_id=rp.id),'[]')) as row_data
 from public.result_publications rp join public.events e on e.id=rp.event_id
 where (p_event_id is null or e.id=p_event_id) and rp.state='published'
 ) rows;
$$;
revoke all on function public.list_result_participants(uuid),public.publish_unified_results(uuid,jsonb,text,text,text),public.unified_event_results(uuid) from public,anon;
grant execute on function public.list_result_participants(uuid),public.publish_unified_results(uuid,jsonb,text,text,text) to authenticated;
grant execute on function public.unified_event_results(uuid) to anon,authenticated;

-- A batch-labelled team must actually be one UG batch. Unlabelled teams may be mixed.
do $$ declare definition text; begin
 select pg_get_functiondef('public.publish_participant_group(uuid,uuid)'::regprocedure) into definition;
 definition:=replace(definition,'if event_record.batch_restricted and group_record.batch_id is null then raise exception ''This event requires a batch-specific group'' using errcode = ''22023''; end if;','');
 definition:=replace(definition,'if event_record.batch_restricted and exists','if group_record.batch_id is not null and exists');
 definition:=replace(definition,'p.batch_id <> group_record.batch_id','(p.participant_category <> ''ug'' or p.batch_id is distinct from group_record.batch_id)');
 execute definition;
end $$;
notify pgrst,'reload schema';
