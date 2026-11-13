-- Run after the theme-roster migration and deploy the matching frontend.
-- Refuse to reinterpret registrations created since the preflight inspection.
begin;
do $$
declare e public.events; theme_key text;
begin
  select * into strict e from public.events where slug='tashan-e-ramp-fashion-show' for update;
  if exists(select 1 from public.applications where event_id=e.id)
    or exists(select 1 from public.participant_groups where event_id=e.id) then
    raise exception 'Fashion Show has participant records; review compatibility before updating.';
  end if;
  select q->>'key' into strict theme_key from jsonb_array_elements(e.application_questions) q where q->>'label'='Choose your theme';
  update public.events set format='group',group_min_size=1,group_max_size=2,
    operating_method='programme',batch_restricted=false,
    eligibility=e.eligibility || jsonb_build_object('division','open','theme_roster_policy',jsonb_build_object(
      'themeQuestionKey',theme_key,'characterQuestionKey','fashion_character',
      'sizes',jsonb_build_object('Retro — Solo',1,'Hero & Villain — Duo',2))),
    application_questions=jsonb_build_array(
      jsonb_build_object('key',theme_key,'label','Choose your theme','type','select','required',true,'options',jsonb_build_array('Retro — Solo','Hero & Villain — Duo')),
      jsonb_build_object('key','fashion_character','label','Which character will you portray?','type','text','required',true)),
    summary='Own the spotlight at Tashan-e-Ramp! Walk solo in Retro style, or team up as a Hero & Villain duo. Choose your theme, tell us which character you will portray, and bring your look to life with confidence and creativity.',
    rules_markdown=E'1. Choose one participation theme: Retro — Solo or Hero & Villain — Duo.\n2. Retro entries must have exactly one performer. Hero & Villain entries must have exactly two performers, portraying one hero and one villain.\n3. Every performer must register individually, choose the appropriate theme, and enter the character they will portray. Both duo partners must choose Hero & Villain — Duo.\n4. After registration approval, the coordinator appoints a performance lead. The lead proposes the performance name and members; the coordinator confirms the final roster and Hero/Villain casting.\n5. A student may join only one final performance in this event. Duo partners may be from different batches.\n6. Costumes must follow the selected theme. Participants must arrange their own costumes and accessories.\n7. Vulgarity or offensive content is not permitted. Announced time limits must be followed.\n8. Further performance details and contacts will be shared by the organisers.'
  where id=e.id;
end;
$$;
commit;
