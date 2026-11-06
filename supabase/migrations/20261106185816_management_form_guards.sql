drop function public.list_admin_event_editor_data();
create function public.list_admin_event_editor_data()
returns table (
  event_id uuid, title text, category public.event_category,
  format public.event_format, score_template text, state public.event_state,
  summary text, rules_markdown text, venue text,
  application_capacity integer, waitlist_enabled boolean,
  application_opens_at timestamptz, application_closes_at timestamptz,
  roster_lock_at timestamptz, reporting_at timestamptz,
  starts_at timestamptz, ends_at timestamptz,
  eligibility jsonb, application_questions jsonb,
  group_min_size integer, group_max_size integer, batch_restricted boolean,
  poster_url text, structure_locked boolean
)
language sql stable security definer set search_path = public as $$
  select e.id, e.title, e.category, e.format, e.score_template, e.state,
    e.summary, e.rules_markdown, e.venue,
    e.application_capacity, e.waitlist_enabled,
    e.application_opens_at, e.application_closes_at,
    e.roster_lock_at, e.reporting_at, e.starts_at, e.ends_at,
    e.eligibility, e.application_questions,
    e.group_min_size, e.group_max_size, e.batch_restricted, e.poster_url,
    e.state <> 'draft' or exists(select 1 from public.applications where event_id=e.id)
      or exists(select 1 from public.participant_groups where event_id=e.id)
      or exists(select 1 from public.fixtures where event_id=e.id)
      or exists(select 1 from public.result_publications where event_id=e.id)
  from public.events e
  where public.can_edit_event_definition(e.id)
  order by e.title;
$$;
revoke all on function public.list_admin_event_editor_data() from public,anon;
grant execute on function public.list_admin_event_editor_data() to authenticated,service_role;

create or replace function public.save_management_event(p_event_id uuid, p_edition_id uuid, p_details jsonb)
returns public.events language plpgsql security definer set search_path=public as $$
declare ev public.events; structural boolean; q jsonb;
begin
  if auth.uid() is null then raise exception 'Not authorised' using errcode='42501'; end if;
  if jsonb_typeof(p_details)<>'object' then raise exception 'Invalid event details' using errcode='22023'; end if;
  if p_details->>'scoreTemplate' not in ('generic','cricket','football','badminton','basketball','set_based')
    or jsonb_typeof(p_details->'applicationQuestions') is distinct from 'array'
    or jsonb_typeof(p_details->'eligibility') is distinct from 'object' then
    raise exception 'Invalid event configuration' using errcode='22023';
  end if;
  if jsonb_array_length(p_details->'applicationQuestions') > 30 then raise exception 'At most 30 questions are allowed' using errcode='22023'; end if;
  for q in select value from jsonb_array_elements(p_details->'applicationQuestions') loop
    if coalesce(length(btrim(q->>'label')),0) not between 1 and 200 or coalesce(length(q->>'key'),0) not between 1 and 80
      or coalesce(q->>'type','') not in ('text','select')
      or jsonb_typeof(q->'required') is distinct from 'boolean'
      or (coalesce(q->>'key','')||' '||coalesce(q->>'label','')) ~* '(roll|batch|full[ _-]?name|phone|mobile|gender|sex)' then
      raise exception 'Check registration question labels and types' using errcode='22023';
    end if;
    if q->>'type'='select' then
      if jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Choice questions require options' using errcode='22023'; end if;
      if jsonb_array_length(q->'options')=0
        or exists(select 1 from jsonb_array_elements_text(q->'options') o where length(btrim(o)) not between 1 and 200)
        or (select count(distinct o) from jsonb_array_elements_text(q->'options') o)<>jsonb_array_length(q->'options') then
        raise exception 'Choice options must be nonempty and unique' using errcode='22023';
      end if;
    end if;
  end loop;
  if (select count(distinct q->>'key') from jsonb_array_elements(p_details->'applicationQuestions') q)<>jsonb_array_length(p_details->'applicationQuestions') then
    raise exception 'Question keys must be unique' using errcode='22023';
  end if;
  if p_event_id is null then
    select * into ev from public.create_admin_event(p_edition_id,p_details->>'title',
      (p_details->>'category')::public.event_category,(p_details->>'format')::public.event_format,
      p_details->>'scoreTemplate',coalesce(p_details->>'summary',''),p_details->>'venue',
      (p_details->>'capacity')::integer,null,null,null,(p_details->>'startsAt')::timestamptz,null,
      coalesce(p_details->'eligibility'->>'division','open'));
  else
    select * into ev from public.events where id=p_event_id for update;
    if not found then raise exception 'Event not found' using errcode='P0002'; end if;
    if not public.can_edit_event_definition(ev.id) then raise exception 'Not authorised' using errcode='42501'; end if;
    structural:=ev.category::text is distinct from p_details->>'category'
      or ev.format::text is distinct from p_details->>'format'
      or ev.score_template is distinct from p_details->>'scoreTemplate';
    if structural then
      if ev.state<>'draft' or exists(select 1 from public.applications where event_id=ev.id)
        or exists(select 1 from public.participant_groups where event_id=ev.id)
        or exists(select 1 from public.fixtures where event_id=ev.id)
        or exists(select 1 from public.result_publications where event_id=ev.id) then
        raise exception 'Category, format and scoring are locked once an event has entries or leaves draft' using errcode='55000';
      end if;
      if p_details->>'scoreTemplate' not in ('generic','cricket','football','badminton','basketball','set_based') then
        raise exception 'Invalid scoring template' using errcode='22023';
      end if;
      update public.events set category=(p_details->>'category')::public.event_category,
        format=(p_details->>'format')::public.event_format,score_template=p_details->>'scoreTemplate' where id=ev.id;
    end if;
  end if;
  select * into ev from public.update_admin_event_full(ev.id,p_details->>'title',
    coalesce(p_details->>'summary',''),coalesce(p_details->>'rules',''),coalesce(p_details->>'venue',''),
    (p_details->>'capacity')::integer,coalesce((p_details->>'waitlistEnabled')::boolean,false),null,null,
    (p_details->>'rosterLockAt')::timestamptz,(p_details->>'reportingAt')::timestamptz,
    (p_details->>'startsAt')::timestamptz,(p_details->>'endsAt')::timestamptz,
    coalesce(p_details->'eligibility','{}'),coalesce(p_details->'applicationQuestions','[]'),
    (p_details->>'groupMinSize')::integer,(p_details->>'groupMaxSize')::integer,
    coalesce((p_details->>'batchRestricted')::boolean,false),p_details->>'posterUrl');
  return ev;
end;
$$;

create or replace function public.get_management_team_rules(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
  return (select jsonb_build_object('event_format',format,'batch_restricted',batch_restricted,'group_min_size',group_min_size,'group_max_size',group_max_size) from public.events where id=p_event_id);
end;
$$;
revoke all on function public.get_management_team_rules(uuid) from public,anon;
grant execute on function public.get_management_team_rules(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
