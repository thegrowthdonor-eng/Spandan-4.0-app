-- Repair legacy remotely-applied escaped JSON literals without changing score fields.
do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.start_fixture(uuid)'::regprocedure);
  definition:=replace(definition,chr(92)||chr(34),chr(34));
  execute definition;
end $migration$;

grant all on private.competition_vote_grants to service_role;

do $migration$ declare definition text; begin
  definition:=pg_get_functiondef('public.competition_workspace(uuid)'::regprocedure);
  definition:=replace(definition,'and (staff or a.student_id=auth.uid())','and exists(select 1 from public.access_records ar where ar.profile_id=a.student_id and ar.edition_id=e.edition_id and ar.state=''active'') and (staff or a.student_id=auth.uid())');
  execute definition;
  definition:=pg_get_functiondef('private.competition_entrant(uuid,uuid,uuid,boolean)'::regprocedure);
  definition:=replace(definition,'if label is null or (p_staff',
    'if p_group is not null and (not exists(select 1 from public.group_memberships where group_id=p_group and removed_at is null) or exists(
      select 1 from public.group_memberships m join public.applications a on a.id=m.application_id left join public.access_records ar on ar.profile_id=a.student_id and ar.edition_id=e.edition_id
      where m.group_id=p_group and m.removed_at is null and (a.event_id<>e.id or a.review_state<>''approved'' or a.selection_state=''not_selected'' or ar.state is distinct from ''active''))) then label:=null; end if;
  if label is null or (p_staff');
  execute definition;
  definition:=pg_get_functiondef('public.competition_command(uuid,text,jsonb)'::regprocedure);
  definition:=replace(definition,'for v in select value from jsonb_array_elements(item->''attempts'') loop',
    'if cfg.result_mode=''faculty_places'' and jsonb_array_length(item->''attempts'')<>0 then raise exception ''Faculty events record approved places, not marks'' using errcode=''22023''; end if;
        for v in select value from jsonb_array_elements(item->''attempts'') loop');
  execute definition;
  foreach definition in array array['public.public_competition(uuid)','public.public_competition_schedule()'] loop
    execute replace(pg_get_functiondef(definition::regprocedure),'e.state not in (''draft'',''cancelled'')','e.state not in (''draft'',''cancelled'') and exists(select 1 from public.editions ed where ed.id=e.edition_id and ed.status=''published'')');
  end loop;
end $migration$;

-- Official results cannot omit a verified award position while still awarding points to others.
create function public.competition_publication_complete()
returns trigger language plpgsql security definer set search_path=public as $$
declare eid uuid; begin
  select event_id into eid from public.result_publications where id=new.publication_id;
  if exists(select 1 from public.competition_settings where event_id=eid and result_mode='public_vote') and exists(
    select 1 from public.competition_placements cp where cp.event_id=eid and not exists(select 1 from public.result_positions rp where rp.publication_id=new.publication_id and rp."placing"=cp."placing")
  ) then raise exception 'Include every verified award position in the official publication' using errcode='22023'; end if;
  return null;
end $$;
revoke all on function public.competition_publication_complete() from public,anon,authenticated;
create constraint trigger competition_complete_podium after insert or update on public.result_positions deferrable initially deferred for each row execute function public.competition_publication_complete();
notify pgrst,'reload schema';
