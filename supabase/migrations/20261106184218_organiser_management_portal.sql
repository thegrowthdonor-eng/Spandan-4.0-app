-- Shared organiser workflow improvements; no historical participant backfill.
create or replace function public.create_admin_event(
  p_edition_id uuid,
  p_title text,
  p_category public.event_category,
  p_format public.event_format,
  p_score_template text,
  p_summary text default '',
  p_venue text default null,
  p_application_capacity integer default null,
  p_application_opens_at timestamptz default null,
  p_application_closes_at timestamptz default null,
  p_reporting_at timestamptz default null,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null,
  p_division text default 'open'
)
returns public.events language plpgsql security definer set search_path = public as $$
declare
  created public.events;
  generated_slug text;
  edition public.editions;
  caller_is_admin boolean;
begin
  caller_is_admin := public.is_main_admin();
  if auth.uid() is null or not public.can_create_events() then raise exception 'Not authorised' using errcode = '42501'; end if;
  select * into edition from public.editions where id = p_edition_id;
  if not found then raise exception 'Festival edition not found' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if p_score_template not in ('generic', 'cricket', 'football', 'badminton', 'basketball', 'set_based') then raise exception 'Invalid score template' using errcode = '22023'; end if;
  if p_division not in ('boys', 'girls', 'open') then raise exception 'Invalid event division' using errcode = '22023'; end if;
  generated_slug := trim(both '-' from regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then raise exception 'Event title needs letters or numbers' using errcode = '22023'; end if;

  insert into public.events (
    edition_id, title, slug, category, format, score_template, summary, venue,
    application_capacity, application_opens_at, application_closes_at, starts_at,
    state, eligibility, created_by
  ) values (
    p_edition_id, btrim(p_title), generated_slug, p_category, p_format,
    p_score_template, btrim(p_summary), nullif(btrim(p_venue), ''),
    p_application_capacity, edition.registration_opens_at, edition.registration_closes_at,
    p_starts_at, 'draft'::public.event_state,
    jsonb_build_object('division', p_division), auth.uid()
  ) returning * into created;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), case when caller_is_admin then 'event.created' else 'event.proposed_by_editor' end,
    'event', created.id, jsonb_build_object('edition_id', p_edition_id, 'slug', created.slug, 'state', created.state));
  return created;
end;
$$;

create or replace function public.update_admin_event_full(
  p_event_id uuid, p_title text, p_summary text, p_rules_markdown text, p_venue text,
  p_application_capacity integer, p_waitlist_enabled boolean, p_application_opens_at timestamptz,
  p_application_closes_at timestamptz, p_roster_lock_at timestamptz, p_reporting_at timestamptz,
  p_starts_at timestamptz, p_ends_at timestamptz, p_eligibility jsonb,
  p_application_questions jsonb, p_group_min_size integer, p_group_max_size integer,
  p_batch_restricted boolean, p_poster_url text default null
)
returns public.events language plpgsql security definer set search_path = public as $$
declare updated public.events; global_opens_at timestamptz; global_closes_at timestamptz; cleaned_questions jsonb;
begin
  if auth.uid() is null or not public.can_edit_event_definition(p_event_id) then raise exception 'Not authorised' using errcode = '42501'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_summary)), 0) > 600 then raise exception 'Summary must be at most 600 characters' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_rules_markdown)), 0) > 20000 then raise exception 'Rules content is too long' using errcode = '22023'; end if;
  if p_group_min_size is not null and p_group_max_size is not null and p_group_max_size < p_group_min_size then raise exception 'Group max size must be at least min size' using errcode = '22023'; end if;
  if p_application_questions is not null and jsonb_typeof(p_application_questions) <> 'array' then raise exception 'Application questions must be a JSON array' using errcode = '22023'; end if;
  if p_eligibility is not null and jsonb_typeof(p_eligibility) <> 'object' then raise exception 'Eligibility must be a JSON object' using errcode = '22023'; end if;
  if lower(coalesce(p_eligibility->>'division', 'open')) not in ('boys', 'girls', 'open') then raise exception 'Invalid event division' using errcode = '22023'; end if;
  select ed.registration_opens_at, ed.registration_closes_at into global_opens_at, global_closes_at
    from public.events e join public.editions ed on ed.id = e.edition_id where e.id = p_event_id;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  select coalesce(jsonb_agg(question), '[]'::jsonb) into cleaned_questions
    from jsonb_array_elements(coalesce(p_application_questions, '[]'::jsonb)) question
    where lower(coalesce(question->>'key', '') || ' ' || coalesce(question->>'label', '')) !~ '(roll|batch|full[ _-]?name|phone|mobile|gender|sex)';
  perform 1 from public.events where id=p_event_id for update;
  if p_reporting_at > p_starts_at or p_ends_at <= p_starts_at then
    raise exception 'Check reporting, start and end times' using errcode='22023';
  end if;
  update public.events set title=btrim(p_title), summary=btrim(p_summary), rules_markdown=btrim(p_rules_markdown),
    venue=nullif(btrim(p_venue), ''), application_capacity=p_application_capacity,
    waitlist_enabled=coalesce(p_waitlist_enabled, false), application_opens_at=global_opens_at,
    application_closes_at=global_closes_at, roster_lock_at=p_roster_lock_at, reporting_at=p_reporting_at,
    starts_at=p_starts_at, ends_at=p_ends_at, eligibility=coalesce(p_eligibility, '{}'::jsonb),
    application_questions=cleaned_questions, group_min_size=p_group_min_size,
    group_max_size=p_group_max_size, batch_restricted=coalesce(p_batch_restricted, false),
    poster_url=nullif(btrim(p_poster_url), '') where id=p_event_id returning * into updated;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
    values (auth.uid(), 'event.full_updated', 'event', updated.id, jsonb_build_object('title', updated.title, 'state', updated.state));
  return updated;
end;
$$;

create or replace function public.review_application(
  p_application_id uuid,
  p_state public.application_review_state,
  p_reason text default null
)
returns public.applications
language plpgsql
security definer
set search_path = public
as $$
declare
  application public.applications;
  prior_state public.application_review_state;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_state not in ('approved', 'rejected', 'waitlisted') then
    raise exception 'Invalid review state' using errcode = '22023';
  end if;
  select app.* into application from public.applications app where app.id = p_application_id for update;
  if not found then
    raise exception 'Application not found' using errcode = 'P0002';
  end if;
  if not public.can_manage_event(application.event_id) then
    raise exception 'Not authorised for this event' using errcode = '42501';
  end if;
  if p_state = 'rejected' and coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'Rejection reason is required' using errcode = '22023';
  end if;
  if application.review_state = 'withdrawn' then
    raise exception 'Withdrawn applications cannot be reviewed' using errcode = '22023';
  end if;
  if p_state <> 'approved' and application.selection_state in ('selected', 'reserve') then
    raise exception 'Clear the roster selection before changing review state' using errcode = '22023';
  end if;
  prior_state := application.review_state;
  update public.applications
  set review_state = p_state,
      review_reason = nullif(btrim(p_reason), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = application.id
  returning * into application;
  insert into public.application_history(
    application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason
  ) values (
    application.id, auth.uid(), prior_state, application.review_state,
    application.selection_state, application.selection_state, nullif(btrim(p_reason), '')
  );
  insert into public.audit_log(actor_id, action, object_type, object_id, reason)
  values (auth.uid(), 'application.review', 'application', application.id, nullif(btrim(p_reason), ''));
  if p_state='approved' and prior_state <> 'approved'
    and exists(select 1 from public.events where id=application.event_id and format='solo') then
    select * into application from public.select_solo_application(application.id, 'selected', 'Selected on approval');
  end if;
  return application;
end;
$$;


create or replace function public.bulk_review_applications(p_application_ids uuid[], p_state public.application_review_state, p_reason text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare app_id uuid; processed integer:=0;
begin
  if auth.uid() is null then raise exception 'Not authorised' using errcode='42501'; end if;
  if cardinality(p_application_ids) is null or cardinality(p_application_ids) not between 1 and 100
    or cardinality(p_application_ids)<>(select count(distinct id) from unnest(p_application_ids) id) then
    raise exception 'Choose 1 to 100 distinct applications' using errcode='22023';
  end if;
  for app_id in select id from unnest(p_application_ids) id order by id loop
    perform public.review_application(app_id,p_state,p_reason);
    processed:=processed+1;
  end loop;
  return processed;
end;
$$;

create or replace function public.get_management_summary()
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare admin boolean; access boolean; creator boolean; managed jsonb; editable jsonb;
begin
  if auth.uid() is null or not public.has_active_festival_access() then
    raise exception 'Active access required' using errcode='42501';
  end if;
  admin:=public.is_main_admin(); access:=public.can_manage_access(); creator:=public.can_create_events();
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'format',e.format,'state',e.state,
    'pending',(select count(*) from public.applications a where a.event_id=e.id and a.review_state='submitted')) order by e.title),'[]') into managed
  from public.events e where public.can_manage_event(e.id);
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'category',e.category,'format',e.format,'state',e.state) order by e.title),'[]') into editable
  from public.events e where public.can_edit_event_definition(e.id);
  return jsonb_build_object(
    'isAdmin',admin,'canVerify',access,'canCreate',creator,'canNotice',public.can_publish_notices(),
    'canGallery',public.can_manage_gallery_moments(),'canLive',public.can_manage_live_desk(),
    'canHelp',admin or access or jsonb_array_length(managed)>0,
    'roles',(select coalesce(jsonb_agg(distinct role),'[]') from public.staff_assignments where profile_id=auth.uid() and revoked_at is null),
    'events',managed,'editableEvents',editable,
    'pendingVerification',case when access then (select count(*) from public.access_records where state='pending') else null end
  );
end;
$$;

create or replace function public.save_management_event(p_event_id uuid, p_edition_id uuid, p_details jsonb)
returns public.events language plpgsql security definer set search_path=public as $$
declare ev public.events; structural boolean;
begin
  if auth.uid() is null then raise exception 'Not authorised' using errcode='42501'; end if;
  if jsonb_typeof(p_details)<>'object' then raise exception 'Invalid event details' using errcode='22023'; end if;
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

create or replace function public.publish_management_team(p_event_id uuid,p_name text,p_batch_id uuid,p_application_ids uuid[],p_captain_id uuid)
returns public.participant_groups language plpgsql security definer set search_path=public as $$
declare team public.participant_groups; app_id uuid;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
  if cardinality(p_application_ids) is null or cardinality(p_application_ids) not between 1 and 200
    or cardinality(p_application_ids)<>(select count(distinct id) from unnest(p_application_ids) id) then
    raise exception 'Select distinct team members' using errcode='22023';
  end if;
  select * into team from public.create_participant_group(p_event_id,p_name,p_batch_id);
  for app_id in select id from unnest(p_application_ids) id order by id loop
    perform public.add_group_member(team.id,app_id);
  end loop;
  select * into team from public.publish_participant_group(team.id,p_captain_id);
  return team;
end;
$$;

create or replace function public.set_admin_event_state(p_event_id uuid, p_state public.event_state)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  event_record public.events;
  edition public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  select * into event_record from public.events where id = p_event_id for update;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if p_state not in ('draft', 'published', 'open', 'closed', 'ongoing', 'completed', 'cancelled') then
    raise exception 'Invalid event lifecycle action' using errcode = '22023';
  end if;
  if p_state in ('published', 'open')
     and (event_record.application_opens_at is null or event_record.application_closes_at is null) then
    select * into edition from public.editions where id = event_record.edition_id;
    if edition.registration_opens_at is not null and edition.registration_closes_at is not null then
      update public.events
      set application_opens_at = edition.registration_opens_at,
          application_closes_at = edition.registration_closes_at
      where id = p_event_id
      returning * into event_record;
    end if;
  end if;
  if p_state in ('published','open') and (
    nullif(btrim(event_record.summary),'') is null or nullif(btrim(event_record.rules_markdown),'') is null
    or nullif(btrim(event_record.venue),'') is null or event_record.starts_at is null
    or (event_record.format<>'solo' and (event_record.group_min_size is null or event_record.group_max_size is null))
  ) then raise exception 'Complete summary, rules, venue, schedule and team sizes before publishing' using errcode='22023'; end if;
  update public.events set state = p_state where id = p_event_id returning * into event_record;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.state_changed', 'event', event_record.id, jsonb_build_object('state', p_state));
  return event_record;
end;
$$;
revoke all on function public.get_management_summary() from public,anon;
grant execute on function public.get_management_summary() to authenticated,service_role;
revoke all on function public.save_management_event(uuid,uuid,jsonb) from public,anon;
grant execute on function public.save_management_event(uuid,uuid,jsonb) to authenticated,service_role;
revoke all on function public.publish_management_team(uuid,text,uuid,uuid[],uuid) from public,anon;
grant execute on function public.publish_management_team(uuid,text,uuid,uuid[],uuid) to authenticated,service_role;
revoke all on function public.review_application(uuid,public.application_review_state,text) from public,anon;
grant execute on function public.review_application(uuid,public.application_review_state,text) to authenticated,service_role;
revoke all on function public.bulk_review_applications(uuid[],public.application_review_state,text) from public,anon;
grant execute on function public.bulk_review_applications(uuid[],public.application_review_state,text) to authenticated,service_role;
notify pgrst,'reload schema';
create or replace function public.can_use_management()
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and public.has_active_festival_access()
    and exists(select 1 from public.staff_assignments where profile_id=auth.uid() and revoked_at is null);
$$;
create or replace function public.get_management_teams(p_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('group_id',g.id,'name',g.name,'state',g.state,'captain_id',g.captain_id,'batch_id',g.batch_id,
    'members',(select coalesce(jsonb_agg(jsonb_build_object('applicationId',a.id,'studentId',p.id,'fullName',p.full_name,
      'batchId',p.batch_id,'batchLabel',b.label,'courseLabel',b.course_label,'roll',p.roll_canonical) order by p.full_name),'[]')
      from public.group_memberships gm join public.applications a on a.id=gm.application_id join public.profiles p on p.id=a.student_id
      left join public.batches b on b.id=p.batch_id where gm.group_id=g.id and gm.removed_at is null)) order by g.name),'[]')
    from public.participant_groups g where g.event_id=p_event_id);
end;
$$;
revoke all on function public.can_use_management() from public,anon;
revoke all on function public.get_management_teams(uuid) from public,anon;
grant execute on function public.can_use_management(),public.get_management_teams(uuid) to authenticated,service_role;
notify pgrst,'reload schema';
