-- Senior registrations are an offline handoff, never UG operational entrants.
set lock_timeout='5s';
set statement_timeout='30s';
alter table public.profiles drop constraint profiles_participant_category_check;
alter table public.profiles add constraint profiles_participant_category_check check (participant_category in ('ug','pg','jr','fmg','faculty'));
alter table private.senior_invites drop constraint senior_invites_category_check;
alter table private.senior_invites add constraint senior_invites_category_check check (category in ('pg','jr','fmg','faculty'));

create table private.senior_signup_links (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  max_accounts integer not null check (max_accounts between 1 and 10000),
  used_count integer not null default 0 check (used_count >= 0 and used_count <= max_accounts),
  closed_at timestamptz,
  issued_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create index senior_signup_links_edition_idx on private.senior_signup_links(edition_id);
create index senior_signup_links_issuer_idx on private.senior_signup_links(issued_by);
create table private.signup_browsers (
  device_hash text primary key check (device_hash ~ '^[a-f0-9]{64}$'),
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index signup_browsers_profile_idx on private.signup_browsers(profile_id);
create table private.senior_enrollments (
  profile_id uuid primary key references public.profiles(id),
  link_id uuid not null references private.senior_signup_links(id),
  created_at timestamptz not null default now()
);
create index senior_enrollments_link_idx on private.senior_enrollments(link_id);
alter table private.senior_signup_links enable row level security;
alter table private.signup_browsers enable row level security;
alter table private.senior_enrollments enable row level security;
revoke all on private.senior_signup_links,private.signup_browsers,private.senior_enrollments from public,anon,authenticated;

create function private.guard_senior_phone() returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.phone_e164,0));
  if exists(select 1 from public.profiles p where p.id<>new.id and p.phone_e164=new.phone_e164
    and (new.participant_category<>'ug' or p.participant_category<>'ug')) then
    raise exception 'This mobile already has an account. Use sign in or account help.' using errcode='23505';
  end if;
  return new;
end $$;
revoke all on function private.guard_senior_phone() from public,anon,authenticated;
create trigger senior_phone_guard before insert or update of phone_e164,participant_category on public.profiles
for each row execute function private.guard_senior_phone();

create function private.remember_signup_browser(p_hash text,p_profile uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_hash !~ '^[a-f0-9]{64}$' or not exists(select 1 from public.profiles where id=p_profile) then
    raise exception 'Browser or profile unavailable' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_hash,1));
  insert into private.signup_browsers(device_hash,profile_id) values(p_hash,p_profile)
    on conflict(device_hash) do update set profile_id=excluded.profile_id where private.signup_browsers.profile_id is null;
end $$;
create function public.remember_signup_browser(p_hash text,p_profile uuid) returns void
language sql security invoker set search_path='' as $$ select private.remember_signup_browser(p_hash,p_profile) $$;

create function private.check_senior_signup(p_hash text,p_device text) returns boolean
language sql stable security definer set search_path='' as $$
  select p_device ~ '^[a-f0-9]{64}$' and not exists(select 1 from private.signup_browsers where device_hash=p_device)
    and exists(select 1 from private.senior_signup_links l join public.editions e on e.id=l.edition_id
      where token_hash=p_hash and l.closed_at is null and l.expires_at>now() and l.used_count<l.max_accounts and e.status<>'archived')
$$;
create function public.check_senior_signup(p_hash text,p_device text) returns boolean
language sql stable security invoker set search_path='' as $$ select private.check_senior_signup(p_hash,p_device) $$;

create function private.complete_senior_signup(p_user uuid,p_email text,p_hash text,p_device text,p_details jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare l private.senior_signup_links;
begin
  select * into l from private.senior_signup_links where token_hash=p_hash for update;
  if not found or l.closed_at is not null or l.expires_at<=now() or l.used_count>=l.max_accounts
    or not exists(select 1 from public.editions where id=l.edition_id and status<>'archived') then
    raise exception 'This signup link is unavailable. Contact the festival team.' using errcode='22023';
  end if;
  if p_device is null or p_device !~ '^[a-f0-9]{64}$' then raise exception 'Reload the signup page.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_device,1));
  if exists(select 1 from private.signup_browsers where device_hash=p_device) then
    raise exception 'This browser already has an account. Use sign in or contact the festival team.' using errcode='23505';
  end if;
  if p_details->>'category' not in ('pg','jr','fmg','faculty') or p_details->>'category' is null
    or p_details->>'phone' is null or p_details->>'phone' !~ '^\+91[6-9][0-9]{9}$'
    or coalesce(length(btrim(p_details->>'fullName')),0) not between 1 and 100
    or coalesce(length(btrim(p_details->>'department')),0) not between 1 and 120
    or p_details->>'gender' is null or p_details->>'gender' not in ('male','female','other','prefer_not_to_say') then
    raise exception 'Check your profile details.' using errcode='22023';
  end if;
  if not exists(select 1 from auth.users where id=p_user and email=p_email) then raise exception 'Identity mismatch' using errcode='22023'; end if;
  insert into public.profiles(id,full_name,phone_e164,fest_id,participant_category,department,gender)
    values(p_user,p_details->>'fullName',p_details->>'phone','SPD-'||upper(substr(replace(p_user::text,'-',''),1,12)),p_details->>'category',p_details->>'department',p_details->>'gender');
  insert into private.senior_login(profile_id,phone,auth_email) values(p_user,p_details->>'phone',p_email);
  insert into public.access_records(edition_id,profile_id,state,verified_at,reason) values(l.edition_id,p_user,'active',now(),'Private signup link; no identity or contribution verification');
  insert into private.signup_browsers(device_hash,profile_id) values(p_device,p_user);
  insert into private.senior_enrollments(profile_id,link_id) values(p_user,l.id);
  update private.senior_signup_links set used_count=used_count+1 where id=l.id;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
    values(p_user,'senior.signup','profile',p_user,jsonb_build_object('link_id',l.id,'category',p_details->>'category'));
end $$;
create function public.complete_senior_signup(p_user uuid,p_email text,p_hash text,p_device text,p_details jsonb) returns void
language sql security invoker set search_path='' as $$ select private.complete_senior_signup(p_user,p_email,p_hash,p_device,p_details) $$;

create function private.manage_senior_signup(p_actor uuid,p_payload jsonb,p_hash text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare action text:=p_payload->>'action'; l private.senior_signup_links; target uuid; result jsonb;
begin
  if p_actor is null or not exists(select 1 from public.profiles p join public.access_records ar on ar.profile_id=p.id
    join public.staff_assignments s on s.profile_id=p.id where p.id=p_actor and ar.state='active' and s.role='main_admin' and s.revoked_at is null) then
    raise exception 'Main Admin required' using errcode='42501';
  end if;
  if action='list' then
    return jsonb_build_object('links',(select coalesce(jsonb_agg(to_jsonb(x)-'token_hash' order by x.created_at desc),'[]') from private.senior_signup_links x),
      'accounts',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'fullName',p.full_name,'phone',p.phone_e164,'category',p.participant_category,'department',p.department,'linkId',en.link_id,'state',ar.state,'editionId',ar.edition_id) order by en.created_at desc),'[]')
        from private.senior_enrollments en join public.profiles p on p.id=en.profile_id join private.senior_signup_links sl on sl.id=en.link_id
        join public.access_records ar on ar.profile_id=p.id and ar.edition_id=sl.edition_id),
      'browserAccounts',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'fullName',p.full_name,'festId',p.fest_id) order by p.full_name),'[]')
        from public.profiles p where exists(select 1 from private.signup_browsers b where b.profile_id=p.id)));
  elsif action in ('create','regenerate') then
    if (p_payload->>'expiresAt')::timestamptz<=now() or p_payload->>'expiresAt' is null
      or (p_payload->>'maxAccounts')::integer not between 1 and 10000 or p_payload->>'maxAccounts' is null
      or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Set a future expiry and account limit.' using errcode='22023'; end if;
    if action='create' then
      if not exists(select 1 from public.editions where id=(p_payload->>'editionId')::uuid and status<>'archived') then raise exception 'Choose a current festival.' using errcode='22023'; end if;
      insert into private.senior_signup_links(edition_id,token_hash,expires_at,max_accounts,issued_by)
        values((p_payload->>'editionId')::uuid,p_hash,(p_payload->>'expiresAt')::timestamptz,(p_payload->>'maxAccounts')::integer,p_actor) returning * into l;
    else
      select * into l from private.senior_signup_links where id=(p_payload->>'linkId')::uuid for update;
      if not found or (p_payload->>'maxAccounts')::integer<l.used_count then raise exception 'Link unavailable or limit is below accounts already created.' using errcode='22023'; end if;
      update private.senior_signup_links set token_hash=p_hash,expires_at=(p_payload->>'expiresAt')::timestamptz,max_accounts=(p_payload->>'maxAccounts')::integer,closed_at=null where id=l.id returning * into l;
    end if;
    result:=to_jsonb(l)-'token_hash'; target:=l.id;
  elsif action='close' then
    update private.senior_signup_links set closed_at=now() where id=(p_payload->>'linkId')::uuid returning * into l;
    if not found then raise exception 'Link unavailable' using errcode='22023'; end if;
    result:=to_jsonb(l)-'token_hash'; target:=l.id;
  elsif action in ('reset_browser','suspend','activate') then
    target:=(p_payload->>'profileId')::uuid;
    if not exists(select 1 from public.profiles where id=target) then raise exception 'Account unavailable' using errcode='22023'; end if;
    if coalesce(length(btrim(p_payload->>'reason')),0) not between 1 and 500 then raise exception 'A reason is required.' using errcode='22023'; end if;
    if action='reset_browser' then
      delete from private.signup_browsers where profile_id=target;
    else
      if not exists(select 1 from private.senior_enrollments where profile_id=target) then raise exception 'Account unavailable' using errcode='22023'; end if;
      update public.access_records set state=case when action='suspend' then 'suspended'::public.access_state else 'active'::public.access_state end,
        reason=p_payload->>'reason',verified_at=coalesce(verified_at,now()),updated_at=now() where profile_id=target;
      if action='suspend' then update private.competition_vote_grants set revoked_at=now() where profile_id=target and revoked_at is null; end if;
    end if;
    result:=jsonb_build_object('ok',true);
  else raise exception 'Unknown command' using errcode='22023'; end if;
  insert into public.audit_log(actor_id,action,object_type,object_id,reason) values(p_actor,'senior.link.'||action,'senior_signup',target,p_payload->>'reason');
  return result;
end $$;
create function public.manage_senior_signup(p_actor uuid,p_payload jsonb,p_hash text default null) returns jsonb
language sql security invoker set search_path='' as $$ select private.manage_senior_signup(p_actor,p_payload,p_hash) $$;

revoke all on function private.remember_signup_browser(text,uuid),private.check_senior_signup(text,text),private.complete_senior_signup(uuid,text,text,text,jsonb),private.manage_senior_signup(uuid,jsonb,text),
  public.remember_signup_browser(text,uuid),public.check_senior_signup(text,text),public.complete_senior_signup(uuid,text,text,text,jsonb),public.manage_senior_signup(uuid,jsonb,text) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.remember_signup_browser(text,uuid),private.check_senior_signup(text,text),private.complete_senior_signup(uuid,text,text,text,jsonb),private.manage_senior_signup(uuid,jsonb,text),
  public.remember_signup_browser(text,uuid),public.check_senior_signup(text,text),public.complete_senior_signup(uuid,text,text,text,jsonb),public.manage_senior_signup(uuid,jsonb,text) to service_role;

create function public.provision_ug_signup(p_auth_user_id uuid,p_edition_id uuid,p_batch_id uuid,p_full_name text,p_roll_canonical text,p_phone_e164 text,p_fest_id text,p_auth_email text,p_gender text,p_device text)
returns public.profiles language plpgsql security invoker set search_path='' as $$
declare p public.profiles;
begin
  if p_device is null or p_device !~ '^[a-f0-9]{64}$' then raise exception 'Reload signup.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_device,1));
  select * into p from public.provision_student_profile(p_auth_user_id,p_edition_id,p_batch_id,p_full_name,p_roll_canonical,p_phone_e164,p_fest_id,p_auth_email,p_gender);
  perform private.remember_signup_browser(p_device,p.id);
  return p;
end $$;
revoke all on function public.provision_ug_signup(uuid,uuid,uuid,text,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.provision_ug_signup(uuid,uuid,uuid,text,text,text,text,text,text,text) to service_role;

create table public.senior_event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id),
  profile_id uuid not null references public.profiles(id),
  full_name text not null,
  category text not null check(category in ('pg','jr','fmg','faculty')),
  department text not null,
  phone text not null,
  gender text not null,
  answers jsonb not null default '{}' check(jsonb_typeof(answers)='object'),
  additional_details text not null default '' check(length(additional_details)<=2000),
  created_at timestamptz not null default now(),
  unique(event_id,profile_id)
);
create index senior_event_registrations_owner_idx on public.senior_event_registrations(profile_id,created_at desc);
alter table public.senior_event_registrations enable row level security;
revoke all on public.senior_event_registrations from public,anon,authenticated;
grant select on public.senior_event_registrations to authenticated;
grant all on public.senior_event_registrations to service_role;
create function private.can_read_senior_entries(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.events e
    join public.access_records ar on ar.edition_id=e.edition_id and ar.profile_id=auth.uid() and ar.state='active'
    join public.staff_assignments s on s.profile_id=ar.profile_id and s.revoked_at is null
    where e.id=p_event and (s.role='main_admin' or (s.role='event_coordinator' and s.event_id=e.id) or (s.role='event_head' and s.event_category=e.category)))
$$;
revoke all on function private.can_read_senior_entries(uuid) from public,anon;
grant execute on function private.can_read_senior_entries(uuid) to authenticated;
create policy senior_registrations_read on public.senior_event_registrations for select to authenticated
  using(profile_id=(select auth.uid()) or private.can_read_senior_entries(event_id));

create function private.register_senior_event(p_event_id uuid,p_answers jsonb,p_details text) returns public.senior_event_registrations
language plpgsql security definer set search_path='' as $$
declare e public.events; p public.profiles; r public.senior_event_registrations; q jsonb; answer text; required_gender text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into p from public.profiles where id=auth.uid();
  if not found or p.participant_category not in ('pg','jr','fmg','faculty') then raise exception 'Senior account required' using errcode='42501'; end if;
  select * into e from public.events where id=p_event_id for share;
  if not found then raise exception 'Event unavailable' using errcode='22023'; end if;
  perform 1 from public.access_records where edition_id=e.edition_id and profile_id=p.id and state='active' for share;
  if not found then raise exception 'Active account required' using errcode='42501'; end if;
  select * into r from public.senior_event_registrations where event_id=e.id and profile_id=p.id;
  if found then return r; end if;
  if not e.registration_enabled or e.state<>'open' or e.application_opens_at is null or e.application_closes_at is null
    or now()<e.application_opens_at or now()>=e.application_closes_at then raise exception 'Registration is not open' using errcode='22023'; end if;
  required_gender:=case lower(coalesce(e.eligibility->>'division','open')) when 'boys' then 'male' when 'girls' then 'female' else null end;
  if required_gender is not null and p.gender is distinct from required_gender then raise exception 'This event is outside your gender division.' using errcode='42501'; end if;
  if jsonb_typeof(p_answers) is distinct from 'object' or p_details is null or length(p_details)>2000 then raise exception 'Check your entry details.' using errcode='22023'; end if;
  for q in select value from jsonb_array_elements(coalesce(e.application_questions,'[]')) loop
    answer:=nullif(btrim(p_answers->>(q->>'key')),'');
    if coalesce((q->>'required')::boolean,false) and answer is null then raise exception 'Complete every required question.' using errcode='22023'; end if;
    if length(answer)>500 or (q->>'type'='select' and answer is not null and not exists(select 1 from jsonb_array_elements_text(q->'options') x where x=answer)) then raise exception 'Check your question answers.' using errcode='22023'; end if;
  end loop;
  if exists(select 1 from jsonb_each(p_answers) a where jsonb_typeof(a.value)<>'string' or not exists(select 1 from jsonb_array_elements(coalesce(e.application_questions,'[]')) configured_question(value) where configured_question.value->>'key'=a.key)) then raise exception 'Unknown or invalid question answer.' using errcode='22023'; end if;
  insert into public.senior_event_registrations(event_id,profile_id,full_name,category,department,phone,gender,answers,additional_details)
    values(e.id,p.id,p.full_name,p.participant_category,p.department,p.phone_e164,p.gender,p_answers,btrim(p_details)) on conflict(event_id,profile_id) do nothing returning * into r;
  if r.id is null then select * into r from public.senior_event_registrations where event_id=e.id and profile_id=p.id; end if;
  return r;
end $$;
create function public.register_senior_event(p_event_id uuid,p_answers jsonb default '{}',p_details text default '') returns public.senior_event_registrations
language sql security invoker set search_path='' as $$ select private.register_senior_event(p_event_id,p_answers,p_details) $$;
revoke all on function private.register_senior_event(uuid,jsonb,text),public.register_senior_event(uuid,jsonb,text) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.register_senior_event(uuid,jsonb,text),public.register_senior_event(uuid,jsonb,text) to authenticated;

-- Guard shared writes, including calls made outside the app UI.
create function private.ug_participation_only() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if tg_table_name='applications' then target:=new.student_id;
  elsif tg_table_name='competition_entries' then target:=new.submitted_by;
  elsif tg_table_name='participant_groups' then target:=new.captain_id;
  elsif tg_table_name='pair_invitations' then
    if exists(select 1 from public.profiles where id=new.recipient_id and participant_category<>'ug') then raise exception 'Use the separate senior registration.' using errcode='42501'; end if;
    target:=new.sender_id;
  end if;
  if target is not null and exists(select 1 from public.profiles where id=target and participant_category<>'ug') then
    raise exception 'Use the separate senior registration.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.ug_participation_only() from public,anon,authenticated;
create trigger ug_applications_only before insert or update of student_id on public.applications for each row execute function private.ug_participation_only();
create trigger ug_pairs_only before insert or update of sender_id,recipient_id on public.pair_invitations for each row execute function private.ug_participation_only();
create trigger ug_entries_only before insert or update of submitted_by on public.competition_entries for each row execute function private.ug_participation_only();
create trigger ug_captains_only before insert or update of captain_id on public.participant_groups for each row execute function private.ug_participation_only();

-- Keep existing validation/handling, adding the category check once at each shared entrypoint.
do $$
declare f record; definition text; guard text;
begin
  for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('apply_to_event','manage_team_proposal','pair_invitation_command','find_pair_partner','get_team_workspace','competition_command') loop
    definition:=pg_get_functiondef(f.oid);
    guard:='begin '||case when f.proname='competition_command' then 'if p_action=''entry'' and ' else 'if ' end||
      'exists(select 1 from public.profiles where id=auth.uid() and participant_category<>''ug'') then raise exception ''Use the separate senior registration.'' using errcode=''42501''; end if;';
    definition:=regexp_replace(definition,'\mbegin\M',guard,'i');
    execute definition;
  end loop;
end $$;

notify pgrst,'reload schema';
reset lock_timeout;
reset statement_timeout;
