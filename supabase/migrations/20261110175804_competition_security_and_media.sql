-- Counters are private even when the ordinary poll options are readable through RLS.
revoke select on public.poll_options from public,anon,authenticated;
grant select(id,poll_id,label,sort_order,entry_id) on public.poll_options to anon,authenticated;

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id),
  event_id uuid references public.events(id),purpose text not null,
  provider text not null check(provider in ('r2','supabase')),object_key text not null unique,
  state text not null check(state in ('uploading','validated','public','archived')),
  input_mime text not null, input_size integer not null check(input_size between 1 and 5242880),
  expires_at timestamptz not null,public_url text,variants jsonb not null default '{}',
  sha256 text,width integer,height integer,bytes integer,created_at timestamptz not null default now(),
  check(state<>'public' or public_url is not null)
);
alter table public.media_assets enable row level security;
revoke all on public.media_assets from public,anon,authenticated;
grant all on public.media_assets to service_role;
create index media_assets_event on public.media_assets(event_id);
create index media_assets_owner on public.media_assets(owner_id,created_at);
alter table public.competition_entries add constraint competition_entry_media_fk foreign key(media_id) references public.media_assets(id);

create function public.competition_entry_media_guard()
returns trigger language plpgsql security definer set search_path=public as $$
declare m public.media_assets; begin
  if new.media_id is not null then
    select * into m from public.media_assets where id=new.media_id;
    if m.event_id is distinct from new.event_id or m.purpose<>'competition' or m.state not in ('validated','public') or (auth.uid() is not null and m.owner_id<>auth.uid() and not public.can_manage_event(new.event_id)) then raise exception 'Choose a validated image belonging to this entrant or assigned staff' using errcode='42501'; end if;
  elsif new.state in ('submitted','approved') then raise exception 'Upload a validated entry image before submission' using errcode='22023'; end if;
  if new.public_media_url is not null and (m.state<>'public' or new.public_media_url is distinct from m.public_url) then raise exception 'Untrusted public media URL' using errcode='42501'; end if;
  return new;
end $$;
revoke all on function public.competition_entry_media_guard() from public,anon,authenticated;
create trigger competition_media_validate before insert or update on public.competition_entries for each row execute function public.competition_entry_media_guard();

create function public.competition_media_access(p_media_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare m public.media_assets; begin
  select * into m from public.media_assets where id=p_media_id;
  if auth.uid() is null or m.id is null or (m.owner_id<>auth.uid() and not public.can_manage_event(m.event_id)) then raise exception 'Media unavailable' using errcode='42501'; end if;
  return to_jsonb(m);
end $$;
revoke all on function public.competition_media_access(uuid) from public,anon;
grant execute on function public.competition_media_access(uuid) to authenticated;

create function public.competition_round_ready()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.competition and exists(select 1 from public.competition_entries n where n.event_id=new.event_id and n.state='approved' and (n.public_media_url is null or not exists(select 1 from public.media_assets m where m.id=n.media_id and m.state='public'))) then raise exception 'Finish approved image publication before freezing voting' using errcode='22023'; end if;
  return new;
end $$;
revoke all on function public.competition_round_ready() from public,anon,authenticated;
create trigger competition_round_media before insert on public.polls for each row execute function public.competition_round_ready();

-- Ordinary polls remain in the old widget; competition voting uses its dedicated gallery.
do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.get_active_polls(uuid)'::regprocedure);
  definition:=replace(definition,'where p.edition_id = p_edition_id','where p.edition_id = p_edition_id and not p.competition');
  execute definition;
end $migration$;

-- Session rows are staff-only; allow the existing authenticated operations hub to read assignments.
grant select on public.competition_sessions to authenticated;
create policy competition_sessions_staff on public.competition_sessions for select to authenticated using(public.can_manage_event(event_id));
