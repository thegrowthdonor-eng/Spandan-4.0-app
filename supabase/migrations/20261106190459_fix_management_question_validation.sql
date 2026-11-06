-- Disambiguate the question alias from the PL/pgSQL validation variable.
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
  if (select count(distinct question_record->>'key') from jsonb_array_elements(p_details->'applicationQuestions') question_record)<>jsonb_array_length(p_details->'applicationQuestions') then
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
notify pgrst,'reload schema';
