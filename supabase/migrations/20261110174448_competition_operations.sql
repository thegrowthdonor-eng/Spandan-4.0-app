-- Additive competition operations. Apply to isolated QA first, never production without approval.
create table public.competition_settings (
  event_id uuid primary key references public.events(id),
  schedule_mode text not null check(schedule_mode in ('match','heat','flight','running_order','session','submission','information')),
  result_mode text not null check(result_mode in ('sport_score','time','distance','count','faculty_places','public_vote','none')),
  attempts integer not null default 1 check(attempts between 1 and 12),
  submission_closes_at timestamptz, verified boolean not null default false,
  version integer not null default 1, updated_at timestamptz not null default now(),
  check((schedule_mode='match')=(result_mode='sport_score')),
  check((schedule_mode='information')=(result_mode='none'))
);
create table public.competition_sessions (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references public.competition_settings(event_id),
  title text not null check(length(btrim(title)) between 1 and 100),
  venue text not null check(length(btrim(venue)) between 1 and 160),
  starts_at timestamptz not null, reporting_at timestamptz, ends_at timestamptz,
  schedule_entry_id uuid references public.schedule_entries(id),
  is_final boolean not null default false,
  state text not null default 'draft' check(state in ('draft','scheduled','live','paused','completed','cancelled')),
  current_position integer, actual_started_at timestamptz, version integer not null default 1,
  check(reporting_at is null or reporting_at<=starts_at),check(ends_at is null or ends_at>=starts_at)
);
create index competition_sessions_event on public.competition_sessions(event_id,starts_at);
create unique index competition_one_final on public.competition_sessions(event_id) where is_final and state<>'cancelled';
create table public.competition_session_entrants (
  id uuid primary key default gen_random_uuid(), session_id uuid not null references public.competition_sessions(id) on delete cascade,
  application_id uuid references public.applications(id), group_id uuid references public.participant_groups(id),
  label text not null, position integer not null check(position>0),
  status text not null default 'valid' check(status in ('valid','dns','dnf','dq')),
  attempts jsonb not null default '[]' check(jsonb_typeof(attempts)='array'),
  "placing" integer check("placing">0),note text not null default '' check(length(note)<=500),
  check(num_nonnulls(application_id,group_id)=1),unique(session_id,position)
);
create unique index competition_session_application on public.competition_session_entrants(session_id,application_id) where application_id is not null;
create unique index competition_session_group on public.competition_session_entrants(session_id,group_id) where group_id is not null;
create unique index competition_session_place on public.competition_session_entrants(session_id,"placing") where "placing" is not null;
create table public.competition_entries (
  id uuid primary key default gen_random_uuid(),event_id uuid not null references public.competition_settings(event_id),
  application_id uuid references public.applications(id),group_id uuid references public.participant_groups(id),
  entry_number bigint generated always as identity, title text not null check(length(btrim(title)) between 1 and 160),
  description text not null default '' check(length(description)<=10000),
  media_id uuid,public_media_url text,
  state text not null default 'draft' check(state in ('draft','submitted','approved','rejected','disqualified')),
  note text not null default '' check(length(note)<=500), version integer not null default 1,
  submitted_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
  check(num_nonnulls(application_id,group_id)=1)
);
create unique index competition_entry_application on public.competition_entries(event_id,application_id) where application_id is not null;
create unique index competition_entry_group on public.competition_entries(event_id,group_id) where group_id is not null;
create index competition_entry_public on public.competition_entries(event_id,entry_number) where state='approved';
alter table public.polls add column competition boolean not null default false;
alter table public.polls add column parent_poll_id uuid references public.polls(id);
alter table public.polls add column round_number integer not null default 0;
create unique index competition_round_number on public.polls(event_id,round_number) where competition;
alter table public.poll_options add column entry_id uuid references public.competition_entries(id);
alter table public.poll_options add column vote_count bigint not null default 0 check(vote_count>=0);
create unique index competition_option_entry on public.poll_options(poll_id,entry_id) where entry_id is not null;
create index competition_votes_option on public.poll_votes(option_id);
create table private.competition_vote_grants (
  token_hash text primary key check(token_hash ~ '^[a-f0-9]{64}$'),
  profile_id uuid not null references public.profiles(id),poll_id uuid not null references public.polls(id),
  session_id uuid not null,expires_at timestamptz not null,revoked_at timestamptz
);
create index competition_grants_session on private.competition_vote_grants(session_id);
create index competition_grants_expiry on private.competition_vote_grants(expires_at);
alter table private.competition_vote_grants enable row level security;
revoke all on private.competition_vote_grants from public,anon,authenticated;
create table public.competition_placements (
  event_id uuid not null references public.events(id),"placing" integer not null,
  entry_id uuid not null references public.competition_entries(id),primary key(event_id,"placing"),unique(event_id,entry_id)
);
do $$ declare t text; begin
  foreach t in array array['competition_settings','competition_sessions','competition_session_entrants','competition_entries','competition_placements'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;

create or replace function private.competition_entrant(p_event uuid,p_application uuid,p_group uuid,p_staff boolean default true)
returns text language plpgsql security definer set search_path=public as $$
declare label text; e public.events; begin
  select * into e from public.events where id=p_event;
  if auth.uid() is null or num_nonnulls(p_application,p_group)<>1 then raise exception 'Choose an eligible entrant' using errcode='22023'; end if;
  if p_application is not null and e.format='solo' then
    select p.full_name into label from public.applications a join public.profiles p on p.id=a.student_id
    join public.access_records ar on ar.profile_id=p.id and ar.edition_id=e.edition_id
    where a.id=p_application and a.event_id=e.id and a.review_state='approved' and a.selection_state<>'not_selected'
      and ar.state='active' and (public.can_manage_event(e.id) or a.student_id=auth.uid());
  elsif p_group is not null and e.format in ('pair','group','sport') then
    select g.name into label from public.participant_groups g where g.id=p_group and g.event_id=e.id and g.state='published'
    and (public.can_manage_event(e.id) or g.captain_id=auth.uid() or (e.format='pair' and exists(
      select 1 from public.group_memberships m join public.applications a on a.id=m.application_id where m.group_id=g.id and m.removed_at is null and a.student_id=auth.uid())));
  end if;
  if label is null or (p_staff and not public.can_manage_event(e.id)) then raise exception 'Entrant is not eligible for this event or account' using errcode='42501'; end if;
  return label;
end $$;
revoke all on function private.competition_entrant(uuid,uuid,uuid,boolean) from public,anon,authenticated;

create or replace function public.start_fixture_for_scoring(p_fixture_id uuid,p_device_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='28000'; end if;
  perform public.start_fixture(p_fixture_id);
  return public.prepare_fixture_offline(p_fixture_id,p_device_id);
end $$;
revoke all on function public.start_fixture_for_scoring(uuid,uuid) from public,anon;
grant execute on function public.start_fixture_for_scoring(uuid,uuid) to authenticated;

create or replace function public.competition_workspace(p_event_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.events; staff boolean; candidates jsonb; own_entries jsonb; begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='28000'; end if;
  select * into e from public.events where id=p_event_id;
  if not found then raise exception 'Event unavailable' using errcode='22023'; end if;
  staff:=public.can_manage_event(e.id);
  if e.format='solo' then
    select coalesce(jsonb_agg(jsonb_build_object('key',a.id,'application_id',a.id,'group_id',null,'label',p.full_name||' · '||coalesce(b.label,'')) order by p.full_name,a.id),'[]') into candidates
    from public.applications a join public.profiles p on p.id=a.student_id left join public.batches b on b.id=p.batch_id
    where a.event_id=e.id and a.review_state='approved' and a.selection_state<>'not_selected' and (staff or a.student_id=auth.uid());
  else
    select coalesce(jsonb_agg(jsonb_build_object('key',g.id,'application_id',null,'group_id',g.id,'label',g.name) order by g.name,g.id),'[]') into candidates
    from public.participant_groups g where g.event_id=e.id and g.state='published' and (staff or g.captain_id=auth.uid() or(e.format='pair' and exists(select 1 from public.group_memberships m join public.applications a on a.id=m.application_id where m.group_id=g.id and m.removed_at is null and a.student_id=auth.uid())));
  end if;
  select coalesce(jsonb_agg(to_jsonb(n) order by n.entry_number),'[]') into own_entries from public.competition_entries n where n.event_id=e.id and (staff or exists(select 1 from jsonb_array_elements(candidates) c where (c->>'application_id')::uuid=n.application_id or (c->>'group_id')::uuid=n.group_id));
  return jsonb_build_object('event',jsonb_build_object('id',e.id,'title',e.title,'format',e.format,'state',e.state,'registration_enabled',e.registration_enabled),'staff',staff,
    'settings',(select to_jsonb(s) from public.competition_settings s where event_id=e.id),'candidates',candidates,'entries',own_entries,
    'rounds',case when staff then (select coalesce(jsonb_agg(to_jsonb(p) order by round_number),'[]') from public.polls p where event_id=e.id and competition) else '[]'::jsonb end,
    'sessions',case when staff then (select coalesce(jsonb_agg(to_jsonb(s)||jsonb_build_object('entrants',(select coalesce(jsonb_agg(to_jsonb(n) order by position),'[]') from public.competition_session_entrants n where session_id=s.id)) order by starts_at),'[]') from public.competition_sessions s where event_id=e.id) else '[]'::jsonb end,
    'placements',case when staff then (select coalesce(jsonb_agg(to_jsonb(p) order by "placing"),'[]') from public.competition_placements p where event_id=e.id) else '[]'::jsonb end);
end $$;
revoke all on function public.competition_workspace(uuid) from public,anon;
grant execute on function public.competition_workspace(uuid) to authenticated;

create or replace function public.competition_command(p_event_id uuid,p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare e public.events; cfg public.competition_settings; s public.competition_sessions; n public.competition_session_entrants;
  entry public.competition_entries; item jsonb; v jsonb; label text; sid uuid; app uuid; grp uuid; round public.polls; first_round public.polls;
  place integer; opt public.poll_options; ids uuid[]; tally integer; reason text:=left(coalesce(p_data->>'reason',''),500);
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='28000'; end if;
  select * into e from public.events where id=p_event_id for update;
  if not found then raise exception 'Event unavailable' using errcode='22023'; end if;
  if p_action not in ('entry') and not public.can_manage_event(e.id) then raise exception 'Not assigned to this event' using errcode='42501'; end if;
  select * into cfg from public.competition_settings where event_id=e.id for update;
  if p_action='settings' then
    if exists(select 1 from public.competition_sessions where event_id=e.id) or exists(select 1 from public.competition_entries where event_id=e.id) or exists(select 1 from public.fixtures where event_id=e.id) or exists(select 1 from public.result_publications where event_id=e.id) then
      if (cfg.event_id is null and (p_data->>'schedule_mode'<>'match' or p_data->>'result_mode'<>'sport_score')) or (cfg.event_id is not null and (cfg.schedule_mode<>p_data->>'schedule_mode' or cfg.result_mode<>p_data->>'result_mode' or cfg.attempts<>(p_data->>'attempts')::integer or cfg.submission_closes_at is distinct from nullif(p_data->>'submission_closes_at','')::timestamptz)) then raise exception 'Configuration is locked after competition records exist' using errcode='22023'; end if;
    end if;
    if cfg.event_id is not null and cfg.version<>coalesce((p_data->>'version')::integer,0) then raise exception 'Refresh changed settings' using errcode='40001'; end if;
    if not e.registration_enabled and (p_data->>'schedule_mode'<>'information' or p_data->>'result_mode'<>'none') then raise exception 'Information-only event cannot have scoring or entries' using errcode='22023'; end if;
    if p_data->>'result_mode'='public_vote' and nullif(p_data->>'submission_closes_at','') is null then raise exception 'Set the submission deadline first' using errcode='22023'; end if;
    insert into public.competition_settings(event_id,schedule_mode,result_mode,attempts,submission_closes_at)
    values(e.id,p_data->>'schedule_mode',p_data->>'result_mode',(p_data->>'attempts')::integer,nullif(p_data->>'submission_closes_at','')::timestamptz)
    on conflict(event_id) do update set schedule_mode=excluded.schedule_mode,result_mode=excluded.result_mode,attempts=excluded.attempts,submission_closes_at=excluded.submission_closes_at,version=competition_settings.version+1,updated_at=now();
  elsif cfg.event_id is null then raise exception 'Configure competition operations first' using errcode='22023';
  elsif p_action='sessions' then
    if cfg.schedule_mode in ('match','submission') or jsonb_typeof(p_data->'sessions') is distinct from 'array' or coalesce(jsonb_array_length(p_data->'sessions'),0) not between 1 and 100 then raise exception 'Invalid session draft' using errcode='22023'; end if;
    for item in select value from jsonb_array_elements(p_data->'sessions') loop
      insert into public.competition_sessions(event_id,title,venue,starts_at,reporting_at,ends_at,is_final,schedule_entry_id)
      values(e.id,item->>'title',item->>'venue',(item->>'starts_at')::timestamptz,nullif(item->>'reporting_at','')::timestamptz,nullif(item->>'ends_at','')::timestamptz,coalesce((item->>'is_final')::boolean,false),nullif(item->>'schedule_entry_id','')::uuid) returning id into sid;
      if nullif(item->>'schedule_entry_id','') is not null and not exists(select 1 from public.schedule_entries where id=(item->>'schedule_entry_id')::uuid and edition_id=e.edition_id) then raise exception 'Programme belongs to a different edition' using errcode='22023'; end if;
      for v in select value from jsonb_array_elements(item->'entrants') loop
        app:=nullif(v->>'application_id','')::uuid; grp:=nullif(v->>'group_id','')::uuid;
        label:=private.competition_entrant(e.id,app,grp);
        insert into public.competition_session_entrants(session_id,application_id,group_id,label,position) values(sid,app,grp,label,(v->>'position')::integer);
      end loop;
      if cfg.result_mode<>'none' and not exists(select 1 from public.competition_session_entrants where session_id=sid) then raise exception 'Choose session entrants' using errcode='22023'; end if;
    end loop;
  elsif p_action in ('session_state','session_results','session_schedule','session_roster') then
    select * into s from public.competition_sessions where id=(p_data->>'session_id')::uuid and event_id=e.id for update;
    if not found then raise exception 'Session unavailable' using errcode='22023'; end if;
    if s.version<>coalesce((p_data->>'version')::integer,0) then raise exception 'Session changed; refresh first' using errcode='40001'; end if;
    if p_action='session_roster' then
      if s.actual_started_at is not null or s.state<>'draft' or jsonb_typeof(p_data->'entrants') is distinct from 'array' then raise exception 'Edit the draft roster before publishing; never reseed a started session' using errcode='22023'; end if;
      delete from public.competition_session_entrants where session_id=s.id;
      for v in select value from jsonb_array_elements(p_data->'entrants') loop
        app:=nullif(v->>'application_id','')::uuid; grp:=nullif(v->>'group_id','')::uuid;
        label:=private.competition_entrant(e.id,app,grp);
        insert into public.competition_session_entrants(session_id,application_id,group_id,label,position) values(s.id,app,grp,label,(v->>'position')::integer);
      end loop;
      if cfg.result_mode<>'none' and not exists(select 1 from public.competition_session_entrants where session_id=s.id) then raise exception 'Choose session entrants' using errcode='22023'; end if;
      update public.competition_sessions set version=version+1 where id=s.id;
    elsif p_action='session_state' then
      if p_data->>'state'='live' and s.actual_started_at is null then
        if e.state in ('draft','cancelled','completed') or (s.starts_at at time zone 'Asia/Kolkata')::date<>(now() at time zone 'Asia/Kolkata')::date then raise exception 'Start only on the scheduled IST day' using errcode='22023'; end if;
        for n in select * from public.competition_session_entrants where session_id=s.id loop perform private.competition_entrant(e.id,n.application_id,n.group_id); end loop;
      elsif p_data->>'state' in ('paused','completed') and s.actual_started_at is null then raise exception 'Start the session first' using errcode='22023'; end if;
      if s.state in ('completed','cancelled') or p_data->>'state' not in ('scheduled','live','paused','completed','cancelled') or (s.actual_started_at is not null and p_data->>'state'='scheduled') then raise exception 'Invalid session transition' using errcode='22023'; end if;
      if p_data->>'state'='completed' and cfg.result_mode in ('time','distance','count') and exists(select 1 from public.competition_session_entrants where session_id=s.id and status='valid' and "placing" is null) then raise exception 'Confirm official places or DNS/DNF/DQ first' using errcode='22023'; end if;
      if nullif(p_data->>'current_position','') is not null and not exists(select 1 from public.competition_session_entrants where session_id=s.id and position=(p_data->>'current_position')::integer) then raise exception 'Unknown performance slot' using errcode='22023'; end if;
      update public.competition_sessions set state=p_data->>'state',actual_started_at=case when p_data->>'state'='live' then coalesce(actual_started_at,now()) else actual_started_at end,current_position=coalesce((p_data->>'current_position')::integer,current_position),version=version+1 where id=s.id;
    elsif p_action='session_schedule' then
      if length(btrim(reason))=0 then raise exception 'Correction reason required' using errcode='22023'; end if;
      update public.competition_sessions set title=p_data->>'title',venue=p_data->>'venue',starts_at=(p_data->>'starts_at')::timestamptz,reporting_at=nullif(p_data->>'reporting_at','')::timestamptz,ends_at=nullif(p_data->>'ends_at','')::timestamptz,version=version+1 where id=s.id;
    else
      if s.actual_started_at is null or s.state='cancelled' or (s.state='completed' and length(btrim(reason))=0) then raise exception 'Start first; completed result corrections need a reason' using errcode='22023'; end if;
      if cfg.result_mode not in ('time','distance','count','faculty_places') or jsonb_typeof(p_data->'results') is distinct from 'array' or coalesce(jsonb_array_length(p_data->'results'),-1)<>(select count(*) from public.competition_session_entrants where session_id=s.id) then raise exception 'Submit all session results' using errcode='22023'; end if;
      if (select count(distinct x->>'id') from jsonb_array_elements(p_data->'results') x)<>jsonb_array_length(p_data->'results') then raise exception 'Duplicate result' using errcode='22023'; end if;
      update public.competition_session_entrants set "placing"=null where session_id=s.id;
      for item in select value from jsonb_array_elements(p_data->'results') loop
        if jsonb_typeof(item->'attempts') is distinct from 'array' or jsonb_array_length(item->'attempts')>cfg.attempts then raise exception 'Invalid attempt count' using errcode='22023'; end if;
        for v in select value from jsonb_array_elements(item->'attempts') loop
          if v<>'null'::jsonb and (jsonb_typeof(v)<>'number' or (v#>>'{}') !~ '^[0-9]+$' or (v#>>'{}')::numeric>9007199254740991) then raise exception 'Use integer measurement units' using errcode='22023'; end if;
        end loop;
        if item->>'status'='valid' and cfg.result_mode in ('time','distance','count') and not exists(select 1 from jsonb_array_elements(item->'attempts') x where x<>'null'::jsonb) then raise exception 'A valid result needs a mark' using errcode='22023'; end if;
        if item->>'status'<>'valid' and nullif(item->>'placing','') is not null then raise exception 'DNS/DNF/DQ cannot have a placing' using errcode='22023'; end if;
        update public.competition_session_entrants set status=item->>'status',attempts=item->'attempts',"placing"=nullif(item->>'placing','')::integer,note=left(coalesce(item->>'note',''),500) where id=(item->>'id')::uuid and session_id=s.id;
        if not found then raise exception 'Result belongs to another session' using errcode='22023'; end if;
      end loop;
      update public.competition_sessions set version=version+1 where id=s.id;
    end if;
  elsif p_action='entry' then
    if cfg.result_mode<>'public_vote' or cfg.submission_closes_at is null or now()>=cfg.submission_closes_at or exists(select 1 from public.polls where event_id=e.id and competition) then raise exception 'Submissions are closed or frozen' using errcode='22023'; end if;
    if e.state in ('draft','cancelled','completed') then raise exception 'Event does not accept entries' using errcode='22023'; end if;
    app:=nullif(p_data->>'application_id','')::uuid; grp:=nullif(p_data->>'group_id','')::uuid;
    label:=private.competition_entrant(e.id,app,grp,false);
    select * into entry from public.competition_entries where event_id=e.id and (application_id=app or group_id=grp) for update;
    if found and entry.version<>coalesce((p_data->>'version')::integer,0) then raise exception 'Entry changed; refresh' using errcode='40001'; end if;
    if entry.state='disqualified' then raise exception 'Disqualified entries cannot be replaced' using errcode='22023'; end if;
    insert into public.competition_entries(id,event_id,application_id,group_id,title,description,media_id,submitted_by,state)
    values(coalesce(entry.id,gen_random_uuid()),e.id,app,grp,p_data->>'title',coalesce(p_data->>'description',''),nullif(p_data->>'media_id','')::uuid,auth.uid(),case when coalesce((p_data->>'submit')::boolean,true) then 'submitted' else 'draft' end)
    on conflict(id) do update set title=excluded.title,description=excluded.description,media_id=excluded.media_id,public_media_url=null,state=excluded.state,note='',version=competition_entries.version+1,updated_at=now();
  elsif p_action='review_entry' then
    select * into entry from public.competition_entries where id=(p_data->>'entry_id')::uuid and event_id=e.id for update;
    if not found then raise exception 'Entry unavailable' using errcode='22023'; end if;
    if entry.version<>coalesce((p_data->>'version')::integer,0) then raise exception 'Entry changed; refresh' using errcode='40001'; end if;
    if p_data->>'state' not in ('approved','rejected','disqualified') or (p_data->>'state'<>'approved' and length(btrim(reason))=0) then raise exception 'Choose review state and reason' using errcode='22023'; end if;
    if exists(select 1 from public.polls where event_id=e.id and competition) and p_data->>'state'<>'disqualified' then raise exception 'Voting entries are frozen' using errcode='22023'; end if;
    if cfg.verified then raise exception 'Officially verified voting is locked' using errcode='22023'; end if;
    if p_data->>'state'='approved' then perform private.competition_entrant(e.id,entry.application_id,entry.group_id); end if;
    update public.competition_entries set state=p_data->>'state',note=reason,version=version+1,updated_at=now() where id=entry.id;
  elsif p_action='voting_round' then
    if e.state in ('draft','cancelled','completed') or cfg.result_mode<>'public_vote' or cfg.verified or cfg.submission_closes_at is null or cfg.submission_closes_at>now() or nullif(p_data->>'opens_at','') is null or nullif(p_data->>'closes_at','') is null or (p_data->>'opens_at')::timestamptz<cfg.submission_closes_at or (p_data->>'closes_at')::timestamptz<=(p_data->>'opens_at')::timestamptz then raise exception 'Close submissions before opening voting' using errcode='22023'; end if;
    if exists(select 1 from public.polls where event_id=e.id and competition and closes_at>now()) then raise exception 'Another round is not closed' using errcode='22023'; end if;
    select * into first_round from public.polls where event_id=e.id and competition order by round_number limit 1;
    if first_round.id is null then
      select array_agg(id order by entry_number) into ids from public.competition_entries where event_id=e.id and state='approved';
    else
      select array_agg(value::uuid) into ids from jsonb_array_elements_text(p_data->'entry_ids');
      if cardinality(ids)<>(select count(distinct x) from unnest(ids) x) then raise exception 'Duplicate runoff entry' using errcode='22023'; end if;
      -- A runoff must include exactly one complete tied group affecting an award place.
      if not exists(select 1 from public.competition_vote_ranking(e.id) r where r.entry_id=ids[1] and r."placing"<=greatest(3,coalesce((select max("placing") from public.point_rules where event_id=e.id),3)) and r.tied) or
        (select array_agg(r.entry_id order by r.entry_id) from public.competition_vote_ranking(e.id) r where r.vote_key=(select vote_key from public.competition_vote_ranking(e.id) where entry_id=ids[1])) is distinct from (select array_agg(x order by x) from unnest(ids) x) then raise exception 'Choose the complete tied podium group for runoff' using errcode='22023'; end if;
    end if;
    if coalesce(cardinality(ids),0)<2 then raise exception 'At least two approved entries are required' using errcode='22023'; end if;
    insert into public.polls(edition_id,event_id,question,opens_at,closes_at,show_totals_before_close,published_at,created_by,competition,parent_poll_id,round_number)
    values(e.edition_id,e.id,left(e.title||' public voting',300),(p_data->>'opens_at')::timestamptz,(p_data->>'closes_at')::timestamptz,false,now(),auth.uid(),true,first_round.id,coalesce((select max(round_number)+1 from public.polls where event_id=e.id and competition),1)) returning * into round;
    insert into public.poll_options(poll_id,label,sort_order,entry_id) select round.id,'Entry '||entry_number||' · '||left(title,100),(row_number() over(order by entry_number))::integer-1,id from public.competition_entries where id=any(ids) and event_id=e.id and state='approved';
    if (select count(*) from public.poll_options where poll_id=round.id)<>cardinality(ids) then raise exception 'Invalid round entries' using errcode='22023'; end if;
  elsif p_action='verify_votes' then
    if cfg.result_mode<>'public_vote' or not exists(select 1 from public.polls where event_id=e.id and competition) or exists(select 1 from public.polls where event_id=e.id and competition and closes_at>now()) then raise exception 'Close all voting rounds first' using errcode='22023'; end if;
    if exists(select 1 from public.polls p where p.event_id=e.id and p.competition and not exists(select 1 from public.poll_votes where poll_id=p.id)) then raise exception 'A round has no votes; no automatic winner' using errcode='22023'; end if;
    if exists(select 1 from public.poll_options o join public.polls p on p.id=o.poll_id where p.event_id=e.id and p.competition and o.vote_count<>(select count(*) from public.poll_votes where option_id=o.id)) then raise exception 'Vote counter integrity check failed' using errcode='22023'; end if;
    tally:=greatest(3,coalesce((select max("placing") from public.point_rules where event_id=e.id),3));
    if exists(select 1 from public.competition_vote_ranking(e.id) where tied and "placing"<=tally) then raise exception 'Podium tie needs a runoff' using errcode='22023'; end if;
    delete from public.competition_placements where event_id=e.id;
    insert into public.competition_placements(event_id,"placing",entry_id) select e.id,"placing",entry_id from public.competition_vote_ranking(e.id) where "placing"<=tally;
    update public.competition_settings set verified=true,version=version+1 where event_id=e.id;
  else raise exception 'Unknown competition action' using errcode='22023'; end if;
  insert into public.audit_log(actor_id,action,object_type,object_id,reason,change_summary) values(auth.uid(),'competition.'||p_action,'event',e.id,nullif(reason,''),jsonb_build_object('session_id',p_data->>'session_id','entry_id',p_data->>'entry_id'));
  return jsonb_build_object('ok',true);
end $$;
revoke all on function public.competition_command(uuid,text,jsonb) from public,anon;
grant execute on function public.competition_command(uuid,text,jsonb) to authenticated;

create or replace function public.competition_vote_ranking(p_event_id uuid)
returns table(entry_id uuid,"placing" integer,tied boolean,vote_key bigint[])
language sql stable security definer set search_path=public as $$
  with scores as (select n.id, array(select coalesce(o.vote_count,0) from public.polls p left join public.poll_options o on o.poll_id=p.id and o.entry_id=n.id where p.event_id=n.event_id and p.competition order by p.round_number) as k
    from public.competition_entries n where n.event_id=p_event_id and n.state='approved' and exists(select 1 from public.poll_options o join public.polls p on p.id=o.poll_id where o.entry_id=n.id and p.competition))
  select id,(rank() over(order by k desc))::integer,(count(*) over(partition by k)>1),k from scores
  where public.can_manage_event(p_event_id) and auth.uid() is not null;
$$;
revoke all on function public.competition_vote_ranking(uuid) from public,anon;
grant execute on function public.competition_vote_ranking(uuid) to authenticated;

create or replace function public.competition_vote_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare p public.polls; begin
  select * into p from public.polls where id=new.poll_id for share;
  if p.competition and (p.published_at is null or now()<p.opens_at or now()>=p.closes_at or not exists(select 1 from public.poll_options o join public.competition_entries n on n.id=o.entry_id where o.id=new.option_id and o.poll_id=p.id and n.state='approved')) then raise exception 'Voting closed or entry unavailable' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.competition_vote_guard() from public,anon,authenticated;
create trigger competition_vote_validate before insert on public.poll_votes for each row execute function public.competition_vote_guard();
create or replace function public.competition_count_vote()
returns trigger language plpgsql set search_path=public as $$ begin
  update public.poll_options set vote_count=vote_count+1 where id=new.option_id;
  return new;
end $$;
revoke all on function public.competition_count_vote() from public,anon,authenticated;
create trigger competition_vote_increment after insert on public.poll_votes for each row execute function public.competition_count_vote();
-- Initialise existing ordinary polls once, without altering their behaviour.
update public.poll_options o set vote_count=(select count(*) from public.poll_votes where option_id=o.id);

create or replace function public.register_competition_vote_grant(p_poll_id uuid,p_hash text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare p public.polls; sid uuid:=nullif(auth.jwt()->>'session_id','')::uuid; receipt uuid; begin
  if auth.uid() is null or sid is null or not exists(select 1 from auth.sessions where id=sid and user_id=auth.uid()) then raise exception 'Sign in again' using errcode='28000'; end if;
  select * into p from public.polls where id=p_poll_id and competition;
  if not found or p.published_at is null or now()<p.opens_at or now()>=p.closes_at then raise exception 'Voting closed' using errcode='22023'; end if;
  if not exists(select 1 from public.access_records where profile_id=auth.uid() and edition_id=p.edition_id and state='active') then raise exception 'Active fest account required' using errcode='42501'; end if;
  select option_id into receipt from public.poll_votes where poll_id=p.id and profile_id=auth.uid();
  if receipt is not null then return jsonb_build_object('optionId',receipt); end if;
  delete from private.competition_vote_grants where expires_at<now();
  insert into private.competition_vote_grants(token_hash,profile_id,poll_id,session_id,expires_at) values(p_hash,auth.uid(),p.id,sid,now()+interval '10 minutes');
  return jsonb_build_object('expiresAt',now()+interval '10 minutes');
end $$;
revoke all on function public.register_competition_vote_grant(uuid,text) from public,anon;
grant execute on function public.register_competition_vote_grant(uuid,text) to authenticated;

create or replace function public.cast_competition_vote(p_token text,p_option_id uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare g private.competition_vote_grants; p public.polls; receipt public.poll_votes; begin
  if p_token is null or length(p_token)<>64 then raise exception 'Voting permission expired' using errcode='42501'; end if;
  select * into g from private.competition_vote_grants where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or g.expires_at<=now() or g.revoked_at is not null or (auth.uid() is not null and auth.uid()<>g.profile_id) or not exists(select 1 from auth.sessions where id=g.session_id and user_id=g.profile_id) then raise exception 'Voting permission expired; sign in again' using errcode='42501'; end if;
  select * into p from public.polls where id=g.poll_id for share;
  if not exists(select 1 from public.access_records where edition_id=p.edition_id and profile_id=g.profile_id and state='active') then raise exception 'Active account required' using errcode='42501'; end if;
  -- A duplicate retry returns the original receipt, including after the close boundary.
  select * into receipt from public.poll_votes where poll_id=p.id and profile_id=g.profile_id;
  if receipt.id is null then
    insert into public.poll_votes(poll_id,option_id,profile_id) values(p.id,p_option_id,g.profile_id) on conflict(poll_id,profile_id) do nothing returning * into receipt;
    if receipt.id is null then select * into receipt from public.poll_votes where poll_id=p.id and profile_id=g.profile_id; end if;
  end if;
  return jsonb_build_object('receiptId',receipt.id,'optionId',receipt.option_id);
end $$;
revoke all on function public.cast_competition_vote(text,uuid) from public;
grant execute on function public.cast_competition_vote(text,uuid) to anon,authenticated;

create or replace function public.revoke_competition_vote_grants()
returns void language sql security definer set search_path=public as $$
  update private.competition_vote_grants set revoked_at=now() where profile_id=auth.uid() and session_id=nullif(auth.jwt()->>'session_id','')::uuid;
$$;
revoke all on function public.revoke_competition_vote_grants() from public,anon;
grant execute on function public.revoke_competition_vote_grants() to authenticated;

create or replace function public.public_competition(p_event_id uuid)
returns jsonb language sql stable security definer set search_path=public as $$
  select jsonb_build_object('eventId',e.id,'title',e.title,'serverTime',now(),'settings',(select jsonb_build_object('schedule_mode',schedule_mode,'result_mode',result_mode,'submission_closes_at',submission_closes_at,'verified',verified) from public.competition_settings where event_id=e.id),
    'entries',(select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'entry_number',n.entry_number,'title',n.title,'description',n.description,'image_url',n.public_media_url) order by n.entry_number),'[]') from public.competition_entries n where n.event_id=e.id and n.state='approved'),
    'rounds',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'round',p.round_number,'opens_at',p.opens_at,'closes_at',p.closes_at,'options',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'entry_id',o.entry_id,'votes',case when now()>=p.closes_at then o.vote_count else null end) order by o.sort_order),'[]') from public.poll_options o where o.poll_id=p.id)) order by p.round_number),'[]') from public.polls p where p.event_id=e.id and p.competition and p.published_at<=now()),
    'sessions',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'venue',s.venue,'starts_at',s.starts_at,'reporting_at',s.reporting_at,'ends_at',s.ends_at,'state',s.state,'current_position',s.current_position,'entrants',(select coalesce(jsonb_agg(jsonb_build_object('label',n.label,'position',n.position,'status',case when s.actual_started_at is not null then n.status else null end,'attempts',case when s.actual_started_at is not null then n.attempts else '[]'::jsonb end,'placing',case when s.actual_started_at is not null then n."placing" else null end) order by n.position),'[]') from public.competition_session_entrants n where n.session_id=s.id)) order by starts_at),'[]') from public.competition_sessions s where s.event_id=e.id and s.state<>'draft'))
  from public.events e where e.id=p_event_id and e.state not in ('draft','cancelled');
$$;
revoke all on function public.public_competition(uuid) from public;
grant execute on function public.public_competition(uuid) to anon,authenticated;

create or replace function public.guard_competition_publication()
returns trigger language plpgsql security definer set search_path=public as $$
declare eid uuid; cfg public.competition_settings; begin
  select event_id into eid from public.result_publications where id=new.publication_id;
  select * into cfg from public.competition_settings where event_id=eid;
  if cfg.result_mode='public_vote' and (not cfg.verified or not exists(select 1 from public.competition_placements r join public.competition_entries n on n.id=r.entry_id where r.event_id=eid and r."placing"=new."placing" and (n.application_id=new.application_id or n.group_id=new.group_id))) then raise exception 'Publish only verified vote-ranked winners after resolving podium ties' using errcode='22023'; end if;
  if cfg.result_mode in ('time','distance','count') and not exists(select 1 from public.competition_sessions s join public.competition_session_entrants n on n.session_id=s.id where s.event_id=eid and s.is_final and s.state='completed' and n.status='valid' and n."placing"=new."placing" and (n.application_id=new.application_id or n.group_id=new.group_id)) then raise exception 'Confirm the final session results before publishing winners' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.guard_competition_publication() from public,anon,authenticated;
create trigger competition_official_results before insert or update on public.result_positions for each row execute function public.guard_competition_publication();
