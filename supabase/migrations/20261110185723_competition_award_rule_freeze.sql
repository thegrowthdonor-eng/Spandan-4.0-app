create function public.competition_award_rules_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.polls where event_id=coalesce(new.event_id,old.event_id) and competition) then raise exception 'Award rules are locked once competition voting options are frozen' using errcode='55000'; end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.competition_award_rules_guard() from public,anon,authenticated;
create trigger competition_award_rule_lock before insert or update or delete on public.point_rules for each row execute function public.competition_award_rules_guard();

create or replace function public.competition_round_ready()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.competition and exists(
    select 1 from generate_series(1,least((select count(*)::integer from public.competition_entries where event_id=new.event_id and state='approved'),greatest(3,coalesce((select max("placing") from public.point_rules where event_id=new.event_id),3)))) award("placing")
    where not exists(select 1 from public.point_rules r where r.event_id=new.event_id and r."placing"=award."placing")
  ) then raise exception 'Configure point rules for every award position in Results before freezing voting' using errcode='22023'; end if;
  if new.competition and exists(select 1 from public.competition_entries n where n.event_id=new.event_id and n.state='approved' and (n.public_media_url is null or not exists(select 1 from public.media_assets m where m.id=n.media_id and m.state='public'))) then raise exception 'Finish approved image publication before freezing voting' using errcode='22023'; end if;
  return new;
end $$;
