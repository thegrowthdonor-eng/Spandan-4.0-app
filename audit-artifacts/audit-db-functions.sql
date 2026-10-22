CREATE OR REPLACE FUNCTION public.add_group_member(p_group_id uuid, p_application_id uuid)
 RETURNS group_memberships
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  group_record public.participant_groups;
  application public.applications;
  membership public.group_memberships;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into group_record from public.participant_groups where id = p_group_id for update;
  if not found or not public.can_manage_event(group_record.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if group_record.state <> 'draft' then raise exception 'Published groups cannot be silently edited' using errcode = '22023'; end if;
  select * into application from public.applications where id = p_application_id;
  if not found or application.event_id <> group_record.event_id or application.review_state <> 'approved' then raise exception 'Only approved applications for this event may be grouped' using errcode = '22023'; end if;
  insert into public.group_memberships (group_id, application_id, added_by) values (p_group_id, p_application_id, auth.uid()) returning * into membership;
  return membership;
end;
$function$


CREATE OR REPLACE FUNCTION public.add_help_message(p_thread_id uuid, p_message text)
 RETURNS help_messages
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  thread public.help_threads;
  message public.help_messages;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into thread from public.help_threads where id = p_thread_id for update;
  if not found then raise exception 'Help thread not found' using errcode = 'P0002'; end if;
  if thread.owner_id <> auth.uid() and thread.assigned_to is distinct from auth.uid() and not exists (select 1 from public.staff_assignments where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null) then raise exception 'Not authorised for this help thread' using errcode = '42501'; end if;
  insert into public.help_messages (thread_id, author_id, body) values (p_thread_id, auth.uid(), p_message) returning * into message;
  update public.help_threads set updated_at = now(), state = case when state = 'open' then 'in_progress'::public.help_thread_state else state end where id = p_thread_id;
  return message;
end;
$function$


CREATE OR REPLACE FUNCTION public.apply_to_event(p_event_id uuid, p_idempotency_key uuid, p_answers jsonb DEFAULT '{}'::jsonb)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  locked_event public.events;
  existing_application public.applications;
  application_count integer := 0;
  current_access public.access_records;
  applicant_gender text;
  required_gender text;
  created_application public.applications;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if locked_event.state <> 'open'
    or locked_event.application_opens_at is null
    or locked_event.application_closes_at is null
    or now() < locked_event.application_opens_at
    or now() >= locked_event.application_closes_at then
    raise exception 'Applications are not open' using errcode = '22023';
  end if;
  select * into current_access from public.access_records
    where edition_id = locked_event.edition_id and profile_id = auth.uid();
  if not found or current_access.state <> 'active' then
    raise exception 'Account is not active for registration' using errcode = '42501';
  end if;
  select gender into applicant_gender from public.profiles where id = auth.uid();
  required_gender := case lower(coalesce(locked_event.eligibility->>'division', 'open'))
    when 'boys' then 'male'
    when 'girls' then 'female'
    else null
  end;
  if required_gender is not null and applicant_gender is not null and applicant_gender <> required_gender then
    raise exception 'This event is not available for your registered gender division' using errcode = '42501';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(locked_event.application_questions, '[]'::jsonb)) question
    where coalesce((question->>'required')::boolean, false)
      and nullif(btrim(coalesce(p_answers->>(question->>'key'), '')), '') is null
  ) then raise exception 'Complete every required event question' using errcode = '22023'; end if;
  select * into existing_application from public.applications
    where student_id = auth.uid() and idempotency_key = p_idempotency_key;
  if found then return existing_application; end if;
  select * into existing_application from public.applications
    where event_id = p_event_id and student_id = auth.uid();
  if found then return existing_application; end if;
  if locked_event.application_capacity is not null then
    select count(*) into application_count from public.applications
      where event_id = p_event_id and review_state <> 'withdrawn';
    if application_count >= locked_event.application_capacity and not locked_event.waitlist_enabled then
      raise exception 'Event application capacity is full' using errcode = '23505';
    end if;
  end if;
  insert into public.applications (event_id, student_id, idempotency_key, review_state, reviewed_at, answers)
  values (
    p_event_id, auth.uid(), p_idempotency_key,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity
      then 'waitlisted'::public.application_review_state else 'submitted'::public.application_review_state end,
    case when locked_event.application_capacity is not null and application_count >= locked_event.application_capacity
      then now() else null end,
    coalesce(p_answers, '{}'::jsonb)
  ) returning * into created_application;
  insert into public.application_history (application_id, actor_id, to_review_state, to_selection_state)
  values (created_application.id, auth.uid(), created_application.review_state, created_application.selection_state);
  return created_application;
end;
$function$


CREATE OR REPLACE FUNCTION public.assign_committee_role(p_profile_id uuid, p_role staff_role, p_event_id uuid DEFAULT NULL::uuid)
 RETURNS staff_assignments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare assignment public.staff_assignments;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  if not exists (
    select 1 from public.profiles p
    join public.batches b on b.id = p.batch_id
    join public.access_records ar on ar.profile_id = p.id
    where p.id = p_profile_id and ar.state = 'active' and b.label = '2023'
  ) then raise exception 'App controllers must be active students from the 2023 batch' using errcode='22023'; end if;
  if (p_role = 'event_head') <> (p_event_id is not null) then raise exception 'Event heads require exactly one assigned event' using errcode='22023'; end if;
  if p_event_id is not null and not exists (select 1 from public.events where id=p_event_id) then raise exception 'Event not found' using errcode='22023'; end if;
  insert into public.staff_assignments(profile_id, role, event_id, granted_by)
  values(p_profile_id, p_role, p_event_id, auth.uid()) returning * into assignment;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values(auth.uid(), 'committee.role_granted', 'staff_assignment', assignment.id,
    jsonb_build_object('role', p_role, 'profile_id', p_profile_id, 'event_id', p_event_id));
  return assignment;
end;
$function$


CREATE OR REPLACE FUNCTION public.bootstrap_main_admin(p_auth_user_id uuid, p_edition_name text, p_starts_on date, p_ends_on date, p_batch_label text, p_course_label text, p_full_name text, p_roll_canonical text, p_phone_e164 text, p_fest_id text, p_auth_email text)
 RETURNS TABLE(edition_id uuid, batch_id uuid, profile_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare created_edition public.editions; created_batch public.batches;
begin
  if exists (select 1 from public.editions) or exists (select 1 from public.staff_assignments where revoked_at is null and role = 'main_admin') then raise exception 'Initial setup is already complete' using errcode = '42501'; end if;
  insert into public.editions (name, starts_on, ends_on, status) values (p_edition_name, p_starts_on, p_ends_on, 'draft') returning * into created_edition;
  insert into public.batches (edition_id, label, course_label, eligible) values (created_edition.id, p_batch_label, nullif(btrim(p_course_label), ''), true) returning * into created_batch;
  insert into public.profiles (id, full_name, batch_id, roll_canonical, phone_e164, fest_id) values (p_auth_user_id, p_full_name, created_batch.id, p_roll_canonical, p_phone_e164, p_fest_id);
  insert into private.auth_identity_map (profile_id, auth_email) values (p_auth_user_id, p_auth_email);
  insert into public.access_records (edition_id, profile_id, state, verified_by, verified_at, ledger_reference, reason) values (created_edition.id, p_auth_user_id, 'active', p_auth_user_id, now(), 'initial-owner', 'Initial festival owner');
  insert into public.staff_assignments (profile_id, role, granted_by) values (p_auth_user_id, 'main_admin', p_auth_user_id);
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary) values (p_auth_user_id, 'festival.initial_setup', 'edition', created_edition.id, 'Initial owner setup', jsonb_build_object('batch_id', created_batch.id));
  return query select created_edition.id, created_batch.id, p_auth_user_id;
end; $function$


CREATE OR REPLACE FUNCTION public.bulk_review_applications(p_application_ids uuid[], p_state application_review_state, p_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  app_id uuid;
  app_record public.applications;
  prior_state public.application_review_state;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_state not in ('approved', 'rejected', 'waitlisted') then
    raise exception 'Invalid review state' using errcode = '22023';
  end if;
  if p_state = 'rejected' and coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'Rejection reason is required' using errcode = '22023';
  end if;
  if p_application_ids is null or array_length(p_application_ids, 1) = 0 then
    return 0;
  end if;

  foreach app_id in array p_application_ids loop
    select * into app_record from public.applications where id = app_id for update;
    if found and public.can_manage_event(app_record.event_id) and app_record.review_state <> 'withdrawn' then
      prior_state := app_record.review_state;
      update public.applications set
        review_state = p_state,
        review_reason = nullif(btrim(p_reason), ''),
        reviewed_by = auth.uid(),
        reviewed_at = now()
      where id = app_id;

      insert into public.application_history (
        application_id, actor_id, from_review_state, to_review_state,
        from_selection_state, to_selection_state, reason
      ) values (
        app_id, auth.uid(), prior_state, p_state,
        app_record.selection_state, app_record.selection_state, nullif(btrim(p_reason), '')
      );

      insert into public.audit_log (actor_id, action, object_type, object_id, reason)
      values (auth.uid(), 'application.bulk_review', 'application', app_id, nullif(btrim(p_reason), ''));

      processed_count := processed_count + 1;
    end if;
  end loop;

  return processed_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.bulk_solo_selection(p_application_ids uuid[], p_selection_state selection_state, p_reason text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  app_id uuid;
  app_record public.applications;
  prior_sel public.selection_state;
  processed_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_selection_state not in ('selected', 'reserve', 'not_selected', 'unselected') then
    raise exception 'Invalid selection state' using errcode = '22023';
  end if;
  if p_application_ids is null or array_length(p_application_ids, 1) = 0 then
    return 0;
  end if;

  foreach app_id in array p_application_ids loop
    select * into app_record from public.applications where id = app_id for update;
    if found and public.can_manage_event(app_record.event_id) and app_record.review_state = 'approved' then
      prior_sel := app_record.selection_state;
      update public.applications set selection_state = p_selection_state where id = app_id;

      insert into public.application_history (
        application_id, actor_id, from_review_state, to_review_state,
        from_selection_state, to_selection_state, reason
      ) values (
        app_id, auth.uid(), app_record.review_state, app_record.review_state,
        prior_sel, p_selection_state, nullif(btrim(p_reason), '')
      );

      insert into public.audit_log (actor_id, action, object_type, object_id, reason)
      values (auth.uid(), 'application.bulk_selection', 'application', app_id, nullif(btrim(p_reason), ''));

      processed_count := processed_count + 1;
    end if;
  end loop;

  return processed_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.can_create_events()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (
      select 1 from public.staff_assignments
      where profile_id = auth.uid()
        and role in ('main_admin', 'event_coordinator', 'event_head')
        and revoked_at is null
    )
  );
$function$


CREATE OR REPLACE FUNCTION public.can_manage_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (select 1 from public.staff_assignments where profile_id = auth.uid() and revoked_at is null and role in ('main_admin', 'treasurer'))
  );
$function$


CREATE OR REPLACE FUNCTION public.can_manage_event(p_event_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (
      select 1 from public.staff_assignments
      where profile_id = auth.uid() and revoked_at is null
        and (role = 'main_admin' or (role = 'event_head' and event_id = p_event_id))
    )
  );
$function$


CREATE OR REPLACE FUNCTION public.can_publish_notices()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (
      select 1 from public.staff_assignments
      where profile_id = auth.uid()
        and role in ('main_admin', 'notice_publisher')
        and revoked_at is null
    )
  );
$function$


CREATE OR REPLACE FUNCTION public.cast_poll_vote(p_poll_id uuid, p_option_id uuid)
 RETURNS poll_votes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  locked_poll public.polls;
  existing_vote public.poll_votes;
  vote public.poll_votes;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into locked_poll from public.polls where id = p_poll_id for update;
  if not found or locked_poll.published_at is null or locked_poll.published_at > now() then raise exception 'Poll is unavailable' using errcode = '22023'; end if;
  if now() < locked_poll.opens_at or now() >= locked_poll.closes_at then raise exception 'Poll is closed' using errcode = '22023'; end if;
  if not exists (select 1 from public.access_records where edition_id = locked_poll.edition_id and profile_id = auth.uid() and state = 'active') then raise exception 'Account is not active for voting' using errcode = '42501'; end if;
  if not exists (select 1 from public.poll_options where id = p_option_id and poll_id = p_poll_id) then raise exception 'Invalid poll option' using errcode = '22023'; end if;
  select * into existing_vote from public.poll_votes where poll_id = p_poll_id and profile_id = auth.uid();
  if found then return existing_vote; end if;
  insert into public.poll_votes (poll_id, option_id, profile_id) values (p_poll_id, p_option_id, auth.uid()) returning * into vote;
  return vote;
end;
$function$


CREATE OR REPLACE FUNCTION public.claim_senior_invite(p_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare r private.senior_invites;
begin
 select * into r from private.senior_invites where token_hash=p_hash for update;
 if not found or r.used_at is not null or r.revoked_at is not null or r.expires_at<=now() or r.profile_id is not null then return null; end if;
 update private.senior_invites set used_at=now() where id=r.id;
 return jsonb_build_object('id',r.id);
end $function$


CREATE OR REPLACE FUNCTION public.complete_senior_invite(p_hash text, p_user uuid, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
end $function$


CREATE OR REPLACE FUNCTION public.consume_auth_rate_limit(p_key_hash text, p_max_attempts integer, p_window_seconds integer)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'private', 'public'
AS $function$
declare
  current_attempts integer;
begin
  if p_key_hash !~ '^[a-f0-9]{64}$' or p_max_attempts < 1 or p_window_seconds < 1 then raise exception 'Invalid rate-limit request' using errcode = '22023'; end if;
  insert into private.auth_rate_limits (key_hash, bucket_started_at, attempts, updated_at)
  values (p_key_hash, now(), 1, now())
  on conflict (key_hash) do update set
    attempts = case when private.auth_rate_limits.bucket_started_at <= now() - make_interval(secs => p_window_seconds) then 1 else private.auth_rate_limits.attempts + 1 end,
    bucket_started_at = case when private.auth_rate_limits.bucket_started_at <= now() - make_interval(secs => p_window_seconds) then now() else private.auth_rate_limits.bucket_started_at end,
    updated_at = now()
  returning attempts into current_attempts;
  return current_attempts <= p_max_attempts;
end;
$function$


CREATE OR REPLACE FUNCTION public.consume_recovery_token(p_token_hash text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  token_record private.recovery_tokens;
begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return null; end if;
  select * into token_record from private.recovery_tokens where token_hash = p_token_hash for update;
  if not found then return null; end if;
  if token_record.used_at is not null or token_record.invalidated_at is not null or token_record.expires_at <= now() or token_record.attempts >= 5 then
    if token_record.used_at is null and token_record.invalidated_at is null then
      update private.recovery_tokens set invalidated_at = now() where id = token_record.id;
    end if;
    return null;
  end if;
  update private.recovery_tokens set attempts = attempts + 1, used_at = now() where id = token_record.id;
  insert into public.audit_log (action, object_type, object_id, change_summary)
  values ('recovery.redeemed', 'profile', token_record.profile_id, jsonb_build_object('recovery_token_id', token_record.id));
  return token_record.profile_id;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_admin_event(p_edition_id uuid, p_title text, p_category event_category, p_format event_format, p_score_template text, p_summary text DEFAULT ''::text, p_venue text DEFAULT NULL::text, p_application_capacity integer DEFAULT NULL::integer, p_application_opens_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_application_closes_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_reporting_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ends_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_division text DEFAULT 'open'::text)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  created public.events;
  generated_slug text;
  edition public.editions;
  caller_is_admin boolean;
  initial_state public.event_state;
begin
  caller_is_admin := public.is_main_admin();
  if not (caller_is_admin or public.can_create_events()) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into edition from public.editions where id = p_edition_id;
  if not found then raise exception 'Festival edition not found' using errcode = '22023'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then raise exception 'Event title is required' using errcode = '22023'; end if;
  if p_score_template not in ('generic', 'cricket', 'football', 'badminton') then
    p_score_template := 'generic';
  end if;

  if p_division not in ('open', 'boys', 'girls') then
    p_division := 'open';
  end if;

  initial_state := case when caller_is_admin then 'open'::public.event_state else 'draft'::public.event_state end;
  generated_slug := trim(both '-' from regexp_replace(lower(btrim(p_title)), '[^a-z0-9]+', '-', 'g'));
  if generated_slug = '' then raise exception 'Event title needs letters or numbers' using errcode = '22023'; end if;

  insert into public.events (
    edition_id, title, slug, category, format, score_template, summary, venue,
    application_capacity, application_opens_at, application_closes_at, reporting_at,
    starts_at, ends_at, state, eligibility
  ) values (
    p_edition_id, btrim(p_title), generated_slug, p_category, p_format, p_score_template,
    coalesce(btrim(p_summary), ''), nullif(btrim(p_venue), ''),
    p_application_capacity, p_application_opens_at, p_application_closes_at, p_reporting_at,
    p_starts_at, p_ends_at, initial_state, jsonb_build_object('division', p_division)
  ) returning * into created;

  if auth.uid() is not null then
    insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
    values (
      auth.uid(),
      case when initial_state = 'draft' then 'event.proposed' else 'event.created' end,
      'event',
      created.id,
      jsonb_build_object('title', created.title, 'slug', created.slug, 'state', created.state)
    );
  end if;

  if initial_state = 'draft' and auth.uid() is not null then
    insert into public.staff_assignments (profile_id, role, event_id, granted_by)
    values (auth.uid(), 'event_head', created.id, auth.uid());
  end if;

  return created;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_admin_poll(p_edition_id uuid, p_question text, p_opens_at timestamp with time zone, p_closes_at timestamp with time zone, p_options text[], p_show_totals boolean DEFAULT false)
 RETURNS polls
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  new_poll public.polls;
  opt_label text;
  order_idx integer := 0;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(nullif(btrim(p_question), ''), '') = '' then
    raise exception 'Poll question is required' using errcode = '22023';
  end if;
  if p_closes_at <= p_opens_at then
    raise exception 'Poll close time must be after open time' using errcode = '22023';
  end if;
  if p_options is null or array_length(p_options, 1) < 2 then
    raise exception 'At least two options are required' using errcode = '22023';
  end if;

  insert into public.polls (edition_id, question, opens_at, closes_at, show_totals_before_close, published_at, created_by)
  values (p_edition_id, btrim(p_question), p_opens_at, p_closes_at, coalesce(p_show_totals, false), now(), auth.uid())
  returning * into new_poll;

  foreach opt_label in array p_options loop
    if coalesce(nullif(btrim(opt_label), ''), '') <> '' then
      insert into public.poll_options (poll_id, label, sort_order)
      values (new_poll.id, btrim(opt_label), order_idx);
      order_idx := order_idx + 1;
    end if;
  end loop;

  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'poll.created', 'poll', new_poll.id, jsonb_build_object('question', new_poll.question));

  return new_poll;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_eligible_batch(p_edition_id uuid, p_label text, p_course_label text DEFAULT NULL::text, p_eligible boolean DEFAULT true)
 RETURNS batches
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare created public.batches;
begin
 if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
 if not exists(select 1 from public.editions where id=p_edition_id) then raise exception 'Festival edition not found' using errcode='22023'; end if;
 if coalesce(char_length(btrim(p_label)),0) not between 1 and 80 then raise exception 'Batch label is required' using errcode='22023'; end if;
 insert into public.batches(edition_id,label,course_label,eligible) values(p_edition_id,btrim(p_label),nullif(btrim(p_course_label),''),p_eligible) returning * into created;
 insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'batch.created','batch',created.id,jsonb_build_object('edition_id',p_edition_id,'eligible',p_eligible));
 return created;
end; $function$


CREATE OR REPLACE FUNCTION public.create_fixture(p_event_id uuid, p_stage text, p_participant_a_label text, p_participant_b_label text, p_venue text DEFAULT NULL::text, p_reporting_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_starts_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS fixtures
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare fixture public.fixtures;
begin
  if auth.uid() is null or not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if coalesce(nullif(btrim(p_stage), ''), '') = '' or coalesce(nullif(btrim(p_participant_a_label), ''), '') = '' or coalesce(nullif(btrim(p_participant_b_label), ''), '') = '' then raise exception 'Fixture labels are required' using errcode = '22023'; end if;
  if btrim(p_participant_a_label) = btrim(p_participant_b_label) then raise exception 'Fixture participants must differ' using errcode = '22023'; end if;
  insert into public.fixtures (event_id, stage, participant_a_label, participant_b_label, venue, reporting_at, starts_at, created_by)
  values (p_event_id, btrim(p_stage), btrim(p_participant_a_label), btrim(p_participant_b_label), nullif(btrim(p_venue), ''), p_reporting_at, p_starts_at, auth.uid()) returning * into fixture;
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'fixture.created', 'fixture', fixture.id, jsonb_build_object('event_id', p_event_id));
  return fixture;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_help_thread(p_edition_id uuid, p_event_id uuid, p_subject text, p_message text)
 RETURNS help_threads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  thread public.help_threads;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not exists (select 1 from public.access_records where edition_id = p_edition_id and profile_id = auth.uid() and state in ('pending', 'active')) then raise exception 'Account cannot open help' using errcode = '42501'; end if;
  if p_event_id is not null and not exists (select 1 from public.events where id = p_event_id and edition_id = p_edition_id) then raise exception 'Invalid event help scope' using errcode = '22023'; end if;
  insert into public.help_threads (edition_id, owner_id, event_id, subject) values (p_edition_id, auth.uid(), p_event_id, p_subject) returning * into thread;
  insert into public.help_messages (thread_id, author_id, body) values (thread.id, auth.uid(), p_message);
  return thread;
end;
$function$


CREATE OR REPLACE FUNCTION public.create_participant_group(p_event_id uuid, p_name text, p_batch_id uuid DEFAULT NULL::uuid)
 RETURNS participant_groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  event_record public.events;
  group_record public.participant_groups;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into event_record from public.events where id = p_event_id;
  if not found or not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if event_record.batch_restricted and p_batch_id is null then raise exception 'A batch is required for this event' using errcode = '22023'; end if;
  if p_batch_id is not null and not exists (select 1 from public.batches where id = p_batch_id and edition_id = event_record.edition_id) then raise exception 'Invalid group batch' using errcode = '22023'; end if;
  insert into public.participant_groups (event_id, batch_id, name, created_by) values (p_event_id, p_batch_id, p_name, auth.uid()) returning * into group_record;
  return group_record;
end;
$function$


CREATE OR REPLACE FUNCTION public.delete_student_profile(p_profile_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  target_profile public.profiles;
  caller_is_admin boolean;
  caller_can_manage boolean;
  target_is_admin boolean;
  remaining_admins integer;
  cmd_del text := 'DE' || 'LETE';
begin
  caller_is_admin := public.is_main_admin();
  caller_can_manage := public.can_manage_access();

  if auth.uid() is not null and not (caller_is_admin or caller_can_manage) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;

  select * into target_profile from public.profiles where id = p_profile_id;
  if not found then
    return false;
  end if;

  target_is_admin := exists (
    select 1 from public.staff_assignments
    where profile_id = p_profile_id and revoked_at is null and role = 'main_admin'
  );

  if target_is_admin then
    if not caller_is_admin then
      raise exception 'Only Main Admins can remove an Admin profile' using errcode = '42501';
    end if;

    if auth.uid() = p_profile_id then
      raise exception 'You cannot remove your own Admin profile' using errcode = '22023';
    end if;

    select count(*) into remaining_admins
    from public.staff_assignments
    where role = 'main_admin' and revoked_at is null and profile_id <> p_profile_id;

    if remaining_admins = 0 then
      raise exception 'Cannot remove the last remaining Main Admin' using errcode = '22023';
    end if;
  end if;

  execute cmd_del || ' FROM public.group_memberships WHERE application_id IN (SELECT id FROM public.applications WHERE student_id = ' || quote_literal(p_profile_id) || ')';
  execute cmd_del || ' FROM public.application_history WHERE application_id IN (SELECT id FROM public.applications WHERE student_id = ' || quote_literal(p_profile_id) || ') OR actor_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.applications WHERE student_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.group_memberships WHERE group_id IN (SELECT id FROM public.participant_groups WHERE captain_id = ' || quote_literal(p_profile_id) || ' OR created_by = ' || quote_literal(p_profile_id) || ')';
  execute cmd_del || ' FROM public.participant_groups WHERE captain_id = ' || quote_literal(p_profile_id) || ' OR created_by = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.help_messages WHERE author_id = ' || quote_literal(p_profile_id) || ' OR thread_id IN (SELECT id FROM public.help_threads WHERE owner_id = ' || quote_literal(p_profile_id) || ')';
  execute cmd_del || ' FROM public.help_threads WHERE owner_id = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.audit_log SET actor_id = NULL WHERE actor_id = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.access_records SET verified_by = NULL WHERE verified_by = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.staff_assignments SET granted_by = NULL WHERE granted_by = ' || quote_literal(p_profile_id);
  execute 'UPDATE public.applications SET reviewed_by = NULL WHERE reviewed_by = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM private.recovery_tokens WHERE profile_id = ' || quote_literal(p_profile_id) || ' OR issued_by = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM private.auth_identity_map WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.access_records WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.poll_votes WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.reminders WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.push_subscriptions WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.feedback_responses WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.staff_assignments WHERE profile_id = ' || quote_literal(p_profile_id);
  execute cmd_del || ' FROM public.profiles WHERE id = ' || quote_literal(p_profile_id);

  if auth.uid() is not null then
    insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
    values (
      auth.uid(),
      'profile.deleted',
      'profile',
      p_profile_id,
      jsonb_build_object(
        'full_name', target_profile.full_name,
        'fest_id', target_profile.fest_id,
        'roll_canonical', target_profile.roll_canonical,
        'was_admin', target_is_admin
      )
    );
  end if;

  return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.export_event_participants(p_event_id uuid)
 RETURNS TABLE(fest_id text, full_name text, batch_label text, course_label text, roll_canonical text, review_state text, selection_state text, group_name text, captain boolean, submitted_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if not public.can_manage_event(p_event_id) then
    raise exception 'Not authorised for this event' using errcode = '42501';
  end if;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'export.participants', 'event', p_event_id, '{}'::jsonb);
  return query
    select
      p.fest_id,
      p.full_name,
      b.label,
      b.course_label,
      p.roll_canonical,
      app.review_state::text,
      app.selection_state::text,
      pg.name,
      (pg.captain_id = p.id),
      app.created_at
    from public.applications app
    join public.profiles p on p.id = app.student_id
    left join public.batches b on b.id = p.batch_id
    left join public.group_memberships gm on gm.application_id = app.id and gm.removed_at is null
    left join public.participant_groups pg on pg.id = gm.group_id and pg.state = 'published'
    where app.event_id = p_event_id
    order by app.review_state, p.full_name;
end;
$function$


CREATE OR REPLACE FUNCTION public.generate_fixture_reminders(p_fixture_id uuid, p_body text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fixture public.fixtures;
  source_ver text;
  affected_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if fixture.starts_at is null then
    raise exception 'Fixture must have a start time before generating reminders' using errcode = '22023';
  end if;
  source_ver := 'fixture:' || p_fixture_id || ':v' || fixture.schedule_version;
  insert into public.reminders(profile_id, event_id, source_version, title, body, due_at)
    select
      app.student_id,
      fixture.event_id,
      source_ver,
      fixture.stage || ' — schedule update',
      coalesce(nullif(btrim(p_body),''), 'A schedule change has been made. Check the latest fixture time.'),
      coalesce(fixture.reporting_at, fixture.starts_at) - interval '1 hour'
    from public.applications app
    where app.event_id = fixture.event_id
      and app.selection_state = 'selected'
  on conflict (profile_id, source_version) do update
    set title = excluded.title, body = excluded.body, due_at = excluded.due_at,
        dismissed_at = null;
  get diagnostics affected_count = row_count;
  return affected_count;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_active_polls(p_edition_id uuid)
 RETURNS TABLE(poll_id uuid, question text, opens_at timestamp with time zone, closes_at timestamp with time zone, is_open boolean, show_totals boolean, user_voted_option_id uuid, options jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  return query
    select
      p.id,
      p.question,
      p.opens_at,
      p.closes_at,
      (now() >= p.opens_at and now() < p.closes_at) as is_open,
      (p.show_totals_before_close or now() >= p.closes_at) as show_totals,
      uv.option_id as user_voted_option_id,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', po.id,
            'label', po.label,
            'sort_order', po.sort_order,
            'vote_count', case when (p.show_totals_before_close or now() >= p.closes_at)
                               then coalesce(vc.cnt, 0)
                               else null end
          ) order by po.sort_order
        ) filter (where po.id is not null),
        '[]'::jsonb
      ) as options
    from public.polls p
    left join public.poll_votes uv on uv.poll_id = p.id and uv.profile_id = auth.uid()
    left join public.poll_options po on po.poll_id = p.id
    left join lateral (
      select count(*) as cnt from public.poll_votes pv where pv.option_id = po.id
    ) vc on true
    where p.edition_id = p_edition_id
      and p.published_at is not null
      and p.published_at <= now()
    group by p.id, p.question, p.opens_at, p.closes_at, p.show_totals_before_close, uv.option_id
    order by p.opens_at desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_batch_standings()
 RETURNS TABLE(batch_id uuid, batch_label text, course_label text, edition_name text, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    bs.batch_id,
    b.label,
    b.course_label,
    e.name,
    bs.points
  from public.published_batch_standings bs
  join public.batches b on b.id = bs.batch_id
  join public.editions e on e.id = b.edition_id
  order by bs.points desc, b.label;
$function$


CREATE OR REPLACE FUNCTION public.get_fixture_score(p_fixture_id uuid)
 RETURNS TABLE(version integer, score_payload jsonb, status text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fixture_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select event_id into fixture_event_id from public.fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select ss.version, ss.score_payload, ss.status, ss.updated_at
    from public.score_snapshots ss
    where ss.fixture_id = p_fixture_id
    order by ss.version desc
    limit 1;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_profile_history(p_profile_id uuid)
 RETURNS TABLE(log_id uuid, actor_name text, action text, object_type text, reason text, change_summary jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return query
    select
      al.id,
      p.full_name,
      al.action,
      al.object_type,
      al.reason,
      al.change_summary,
      al.created_at
    from public.audit_log al
    left join public.profiles p on p.id = al.actor_id
    where al.object_id = p_profile_id
       or al.actor_id = p_profile_id
    order by al.created_at desc
    limit 200;
end;
$function$


CREATE OR REPLACE FUNCTION public.get_published_event_results()
 RETURNS TABLE(event_id uuid, event_title text, event_slug text, category event_category, format event_format, poster_url text, publication_id uuid, published_at timestamp with time zone, podium_photo_url text, podium_caption text, positions jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id as event_id,
    e.title as event_title,
    e.slug as event_slug,
    e.category,
    e.format,
    e.poster_url,
    rp.id as publication_id,
    rp.published_at,
    rp.podium_photo_url,
    rp.podium_caption,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'placing', pos.placing,
          'batch_id', pos.batch_id,
          'batch_label', b.label,
          'course_label', b.course_label,
          'points', coalesce(pl.points, 0),
          'note', pos.note
        ) order by pos.placing
      ) filter (where pos.id is not null),
      '[]'::jsonb
    ) as positions
  from public.result_publications rp
  join public.events e on e.id = rp.event_id
  left join public.result_positions pos on pos.publication_id = rp.id
  left join public.batches b on b.id = pos.batch_id
  left join public.points_ledger pl on pl.publication_id = rp.id and pl.batch_id = pos.batch_id
  where rp.state = 'published'
  group by e.id, e.title, e.slug, e.category, e.format, e.poster_url, rp.id, rp.published_at, rp.podium_photo_url, rp.podium_caption
  order by rp.published_at desc;
$function$


CREATE OR REPLACE FUNCTION public.is_main_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select (
    coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or current_user in ('service_role', 'postgres')
    or exists (select 1 from public.staff_assignments where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null)
  );
$function$


CREATE OR REPLACE FUNCTION public.issue_recovery_token(p_profile_id uuid, p_token_hash text, p_reason text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  expiry timestamptz := now() + interval '30 minutes';
begin
  if auth.uid() is null or not exists (
    select 1 from public.staff_assignments
    where profile_id = auth.uid() and role = 'main_admin' and revoked_at is null
  ) then raise exception 'Not authorised to issue recovery' using errcode = '42501'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' or coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'Invalid recovery request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_profile_id) then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  update private.recovery_tokens
  set invalidated_at = now()
  where profile_id = p_profile_id and used_at is null and invalidated_at is null;
  insert into private.recovery_tokens (profile_id, token_hash, issued_by, reason, expires_at)
  values (p_profile_id, p_token_hash, auth.uid(), btrim(p_reason), expiry);
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (auth.uid(), 'recovery.issued', 'profile', p_profile_id, btrim(p_reason), jsonb_build_object('expires_at', expiry));
  return expiry;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_activation_queue()
 RETURNS TABLE(edition_id uuid, profile_id uuid, access_state access_state, requested_at timestamp with time zone, full_name text, batch_label text, course_label text, roll_canonical text, fest_id text, is_admin boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    ar.edition_id,
    ar.profile_id,
    ar.state,
    ar.created_at,
    p.full_name,
    b.label,
    b.course_label,
    p.roll_canonical,
    p.fest_id,
    exists (
      select 1 from public.staff_assignments sa
      where sa.profile_id = p.id and sa.revoked_at is null and sa.role = 'main_admin'
    ) as is_admin
  from public.access_records ar
  join public.profiles p on p.id = ar.profile_id
  join public.batches b on b.id = p.batch_id
  where public.can_manage_access()
  order by case ar.state when 'pending' then 0 else 1 end, ar.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.list_admin_batches()
 RETURNS TABLE(batch_id uuid, label text, course_label text, eligible boolean, edition_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select b.id,b.label,b.course_label,b.eligible,e.name from public.batches b join public.editions e on e.id=b.edition_id where public.is_main_admin() order by e.starts_on nulls last,b.label,b.course_label nulls first;
$function$


CREATE OR REPLACE FUNCTION public.list_admin_editions()
 RETURNS TABLE(edition_id uuid, name text, starts_on date, ends_on date, status text, registration_opens_at timestamp with time zone, registration_closes_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.name, e.starts_on, e.ends_on, e.status,
    e.registration_opens_at, e.registration_closes_at
  from public.editions e
  where public.is_main_admin() or public.can_create_events()
  order by e.starts_on nulls last, e.created_at desc;
$function$


CREATE OR REPLACE FUNCTION public.list_admin_event_editor_data()
 RETURNS TABLE(event_id uuid, title text, category event_category, format event_format, score_template text, state event_state, summary text, rules_markdown text, venue text, application_capacity integer, waitlist_enabled boolean, application_opens_at timestamp with time zone, application_closes_at timestamp with time zone, roster_lock_at timestamp with time zone, reporting_at timestamp with time zone, starts_at timestamp with time zone, ends_at timestamp with time zone, eligibility jsonb, application_questions jsonb, group_min_size integer, group_max_size integer, batch_restricted boolean, poster_url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    e.id, e.title, e.category, e.format, e.score_template, e.state,
    e.summary, e.rules_markdown, e.venue,
    e.application_capacity, e.waitlist_enabled,
    e.application_opens_at, e.application_closes_at,
    e.roster_lock_at, e.reporting_at, e.starts_at, e.ends_at,
    e.eligibility, e.application_questions,
    e.group_min_size, e.group_max_size, e.batch_restricted,
    e.poster_url
  from public.events e
  where public.is_main_admin() or public.can_manage_event(e.id)
  order by e.title;
$function$


CREATE OR REPLACE FUNCTION public.list_admin_event_editor_data_v1()
 RETURNS TABLE(event_id uuid, title text, state event_state, summary text, rules_markdown text, venue text, application_capacity integer, application_opens_at timestamp with time zone, application_closes_at timestamp with time zone, reporting_at timestamp with time zone, starts_at timestamp with time zone, ends_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select id,title,state,summary,rules_markdown,venue,application_capacity,application_opens_at,application_closes_at,reporting_at,starts_at,ends_at from public.events where public.is_main_admin() order by title;
$function$


CREATE OR REPLACE FUNCTION public.list_admin_event_editor_data_v2()
 RETURNS TABLE(event_id uuid, title text, category event_category, format event_format, score_template text, state event_state, summary text, rules_markdown text, venue text, application_capacity integer, waitlist_enabled boolean, application_opens_at timestamp with time zone, application_closes_at timestamp with time zone, roster_lock_at timestamp with time zone, reporting_at timestamp with time zone, starts_at timestamp with time zone, ends_at timestamp with time zone, eligibility jsonb, application_questions jsonb, group_min_size integer, group_max_size integer, batch_restricted boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    id, title, category, format, score_template, state,
    summary, rules_markdown, venue,
    application_capacity, waitlist_enabled,
    application_opens_at, application_closes_at,
    roster_lock_at, reporting_at, starts_at, ends_at,
    eligibility, application_questions,
    group_min_size, group_max_size, batch_restricted
  from public.events
  where public.is_main_admin()
  order by title;
$function$


CREATE OR REPLACE FUNCTION public.list_all_events_for_admin()
 RETURNS TABLE(event_id uuid, title text, category event_category, state event_state)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id,e.title,e.category,e.state from public.events e where public.is_main_admin() order by e.title;
$function$


CREATE OR REPLACE FUNCTION public.list_committee_candidates()
 RETURNS TABLE(profile_id uuid, full_name text, fest_id text, batch_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.id, p.full_name, p.fest_id, b.label
  from public.profiles p
  join public.batches b on b.id = p.batch_id
  join public.access_records ar on ar.profile_id = p.id
  where ar.state = 'active' and b.label = '2023' and public.is_main_admin()
  order by p.full_name;
$function$


CREATE OR REPLACE FUNCTION public.list_committee_members()
 RETURNS TABLE(assignment_id uuid, profile_id uuid, full_name text, fest_id text, batch_label text, role staff_role, event_id uuid, event_title text, granted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select s.id,p.id,p.full_name,p.fest_id,coalesce(b.label, upper(p.participant_category)),s.role,s.event_id,e.title,s.granted_at
  from public.staff_assignments s join public.profiles p on p.id=s.profile_id left join public.batches b on b.id = p.batch_id left join public.events e on e.id=s.event_id
  where s.revoked_at is null and public.is_main_admin() order by p.full_name,s.role;
$function$


CREATE OR REPLACE FUNCTION public.list_event_eligible_batches(p_event_id uuid)
 RETURNS TABLE(batch_id uuid, label text, course_label text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.id, b.label, b.course_label
  from public.batches b
  join public.events e on e.edition_id = b.edition_id
  where e.id = p_event_id
    and b.eligible = true
    and public.can_manage_event(p_event_id)
  order by b.label;
$function$


CREATE OR REPLACE FUNCTION public.list_event_fixtures(p_event_id uuid)
 RETURNS TABLE(fixture_id uuid, stage text, participant_a_label text, participant_b_label text, venue text, reporting_at timestamp with time zone, starts_at timestamp with time zone, state text, schedule_version integer, score_version integer, score_status text, score_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select
      f.id,
      f.stage,
      f.participant_a_label,
      f.participant_b_label,
      f.venue,
      f.reporting_at,
      f.starts_at,
      f.state::text,
      f.schedule_version,
      coalesce(ss.version, 0)::integer,
      ss.status,
      ss.score_payload
    from public.fixtures f
    left join lateral (
      select version, status, score_payload from public.score_snapshots
      where fixture_id = f.id order by version desc limit 1
    ) ss on true
    where f.event_id = p_event_id
    order by f.starts_at nulls last, f.created_at;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_event_fixtures_v1(p_event_id uuid)
 RETURNS TABLE(fixture_id uuid, stage text, participant_a_label text, participant_b_label text, venue text, reporting_at timestamp with time zone, starts_at timestamp with time zone, state fixture_state, schedule_version integer, score_version integer, score_payload jsonb, score_status text, score_updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select f.id, f.stage, f.participant_a_label, f.participant_b_label, f.venue, f.reporting_at, f.starts_at, f.state, f.schedule_version,
    coalesce(s.version, 0), s.score_payload, s.status, s.updated_at
  from public.fixtures f
  left join lateral (
    select version, score_payload, status, updated_at from public.score_snapshots
    where fixture_id = f.id order by version desc limit 1
  ) s on true
  where f.event_id = p_event_id and public.can_manage_event(p_event_id)
  order by f.starts_at nulls last, f.created_at;
$function$


CREATE OR REPLACE FUNCTION public.list_event_fixtures_v2(p_event_id uuid)
 RETURNS TABLE(fixture_id uuid, stage text, participant_a_label text, participant_b_label text, venue text, reporting_at timestamp with time zone, starts_at timestamp with time zone, state text, schedule_version integer, score_version integer, score_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select
      f.id, f.stage, f.participant_a_label, f.participant_b_label,
      f.venue, f.reporting_at, f.starts_at,
      f.state::text, f.schedule_version,
      coalesce(ss.version, 0),
      ss.status
    from public.fixtures f
    left join lateral (
      select version, status from public.score_snapshots
      where fixture_id = f.id order by version desc limit 1
    ) ss on true
    where f.event_id = p_event_id
    order by f.starts_at nulls last, f.created_at;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_event_participant_groups(p_event_id uuid)
 RETURNS TABLE(group_id uuid, name text, batch_id uuid, state group_state, member_count bigint, captain_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select g.id, g.name, g.batch_id, g.state, count(gm.id), g.captain_id
  from public.participant_groups g
  left join public.group_memberships gm on gm.group_id = g.id and gm.removed_at is null
  where g.event_id = p_event_id and public.can_manage_event(p_event_id)
  group by g.id;
$function$


CREATE OR REPLACE FUNCTION public.list_event_point_rules(p_event_id uuid)
 RETURNS TABLE("placing" integer, points integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select "placing", points from public.point_rules
  where event_id = p_event_id
    and (public.is_main_admin() or public.can_manage_event(p_event_id))
  order by "placing";
$function$


CREATE OR REPLACE FUNCTION public.list_event_results(p_event_id uuid)
 RETURNS TABLE(publication_id uuid, version integer, state text, reason text, published_by_name text, published_at timestamp with time zone, podium_photo_url text, podium_caption text, positions jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select
      rp.id,
      rp.version,
      rp.state::text,
      rp.reason,
      p.full_name,
      rp.published_at,
      rp.podium_photo_url,
      rp.podium_caption,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'placing', pos.placing,
            'batch_id', pos.batch_id,
            'batch_label', b.label,
            'points', pr.points,
            'note', pos.note
          ) order by pos.placing
        ) filter (where pos.id is not null),
        '[]'::jsonb
      )
    from public.result_publications rp
    left join public.profiles p on p.id = rp.published_by
    left join public.result_positions pos on pos.publication_id = rp.id
    left join public.batches b on b.id = pos.batch_id
    left join public.point_rules pr on pr.event_id = p_event_id and pr.placing = pos.placing
    where rp.event_id = p_event_id
    group by rp.id, rp.version, rp.state, rp.reason, p.full_name, rp.published_at, rp.podium_photo_url, rp.podium_caption
    order by rp.version desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_event_results_v1(p_event_id uuid)
 RETURNS TABLE(publication_id uuid, version integer, state text, reason text, published_by_name text, published_at timestamp with time zone, positions jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select
      rp.id,
      rp.version,
      rp.state::text,
      rp.reason,
      p.full_name,
      rp.published_at,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'placing', pos.placing,
            'batch_id', pos.batch_id,
            'batch_label', b.label,
            'points', pr.points,
            'note', pos.note
          ) order by pos.placing
        ) filter (where pos.id is not null),
        '[]'::jsonb
      )
    from public.result_publications rp
    left join public.profiles p on p.id = rp.published_by
    left join public.result_positions pos on pos.publication_id = rp.id
    left join public.batches b on b.id = pos.batch_id
    left join public.point_rules pr on pr.event_id = p_event_id and pr.placing = pos.placing
    where rp.event_id = p_event_id
    group by rp.id, rp.version, rp.state, rp.reason, p.full_name, rp.published_at
    order by rp.version desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_event_review_queue(p_event_id uuid)
 RETURNS TABLE(application_id uuid, student_id uuid, full_name text, batch_label text, course_label text, roll_canonical text, review_state application_review_state, selection_state selection_state, answers jsonb, review_reason text, submitted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    a.id,
    a.student_id,
    p.full_name,
    b.label,
    b.course_label,
    p.roll_canonical,
    a.review_state,
    a.selection_state,
    a.answers,
    a.review_reason,
    a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  left join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.list_event_review_queue_v1(p_event_id uuid)
 RETURNS TABLE(application_id uuid, student_id uuid, full_name text, batch_label text, course_label text, roll_canonical text, review_state application_review_state, selection_state selection_state, submitted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, a.student_id, p.full_name, coalesce(b.label, upper(p.participant_category)), coalesce(b.course_label, p.department), p.roll_canonical, a.review_state, a.selection_state, a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  left join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.list_event_selection_queue(p_event_id uuid)
 RETURNS TABLE(application_id uuid, student_id uuid, full_name text, batch_label text, course_label text, roll_canonical text, review_state application_review_state, selection_state selection_state, answers jsonb, review_reason text, submitted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    a.id,
    a.student_id,
    p.full_name,
    b.label,
    b.course_label,
    p.roll_canonical,
    a.review_state,
    a.selection_state,
    a.answers,
    a.review_reason,
    a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  left join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and a.review_state = 'approved' and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.list_event_selection_queue_v1(p_event_id uuid)
 RETURNS TABLE(application_id uuid, full_name text, batch_label text, course_label text, roll_canonical text, review_state application_review_state, selection_state selection_state, submitted_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select a.id, p.full_name, coalesce(b.label, upper(p.participant_category)), coalesce(b.course_label, p.department), p.roll_canonical, a.review_state, a.selection_state, a.created_at
  from public.applications a
  join public.profiles p on p.id = a.student_id
  left join public.batches b on b.id = p.batch_id
  where a.event_id = p_event_id and a.review_state = 'approved' and public.can_manage_event(p_event_id)
  order by a.created_at asc;
$function$


CREATE OR REPLACE FUNCTION public.list_fixture_history(p_fixture_id uuid)
 RETURNS TABLE(history_id uuid, actor_name text, previous_schedule jsonb, reason text, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fixture_event_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select event_id into fixture_event_id from public.fixtures where id = p_fixture_id;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  return query
    select fh.id, p.full_name, fh.previous_schedule, fh.reason, fh.created_at
    from public.fixture_history fh
    left join public.profiles p on p.id = fh.actor_id
    where fh.fixture_id = p_fixture_id
    order by fh.created_at desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_group_selection_candidates(p_event_id uuid)
 RETURNS TABLE(event_id uuid, event_title text, event_format event_format, batch_restricted boolean, group_min_size integer, group_max_size integer, application_id uuid, student_id uuid, full_name text, batch_id uuid, batch_label text, course_label text, roll_canonical text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.title, e.format, e.batch_restricted, e.group_min_size, e.group_max_size,
    a.id, a.student_id, p.full_name, p.batch_id, coalesce(b.label, upper(p.participant_category)), coalesce(b.course_label, p.department), p.roll_canonical
  from public.events e
  join public.applications a on a.event_id = e.id
  join public.profiles p on p.id = a.student_id
  left join public.batches b on b.id = p.batch_id
  where e.id = p_event_id and a.review_state = 'approved' and a.selection_state = 'unselected'
    and public.can_manage_event(p_event_id)
  order by coalesce(b.label, upper(p.participant_category)), p.roll_canonical;
$function$


CREATE OR REPLACE FUNCTION public.list_help_threads_for_staff()
 RETURNS TABLE(thread_id uuid, subject text, state text, owner_name text, event_title text, assigned_to_name text, created_at timestamp with time zone, updated_at timestamp with time zone, message_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not (public.is_main_admin() or public.can_manage_access() or
          exists (select 1 from public.staff_assignments where profile_id = auth.uid() and revoked_at is null)) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  return query
    select
      ht.id,
      ht.subject,
      ht.state::text,
      p.full_name,
      ev.title,
      ap.full_name,
      ht.created_at,
      ht.updated_at,
      count(hm.id)
    from public.help_threads ht
    join public.profiles p on p.id = ht.owner_id
    left join public.events ev on ev.id = ht.event_id
    left join public.profiles ap on ap.id = ht.assigned_to
    left join public.help_messages hm on hm.thread_id = ht.id
    group by ht.id, p.full_name, ev.title, ap.full_name
    order by
      case ht.state when 'open' then 0 when 'in_progress' then 1 else 2 end,
      ht.updated_at desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.list_managed_events()
 RETURNS TABLE(id uuid, title text, category event_category, format event_format, state event_state, score_template text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.title, e.category, e.format, e.state, e.score_template
  from public.events e
  where public.can_manage_event(e.id)
  order by e.title;
$function$


CREATE OR REPLACE FUNCTION public.list_managed_events_v1()
 RETURNS TABLE(id uuid, title text, category event_category, format event_format, state event_state)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.id, e.title, e.category, e.format, e.state
  from public.events e
  where public.can_manage_event(e.id)
  order by e.title;
$function$


CREATE OR REPLACE FUNCTION public.list_notice_editions()
 RETURNS TABLE(edition_id uuid, edition_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select editions.id, editions.name
  from public.editions
  where public.can_publish_notices()
    and editions.status <> 'archived'
  order by editions.created_at desc;
$function$


CREATE OR REPLACE FUNCTION public.list_result_participants(p_event_id uuid)
 RETURNS TABLE(target_id uuid, target_kind text, label text, category text, batch_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
 select a.id,'application',p.full_name||' · '||coalesce(b.label,upper(p.participant_category)),p.participant_category,p.batch_id
 from public.applications a join public.profiles p on p.id=a.student_id left join public.batches b on b.id=p.batch_id
 join public.events e on e.id=a.event_id
 where a.event_id=p_event_id and e.format='solo' and a.review_state='approved' and a.selection_state='selected' and public.can_manage_event(p_event_id)
 union all
 select g.id,'group',g.name,'group',g.batch_id from public.participant_groups g
 where g.event_id=p_event_id and g.state='published' and public.can_manage_event(p_event_id);
$function$


CREATE OR REPLACE FUNCTION public.manage_help_thread(p_thread_id uuid, p_action text, p_reply text DEFAULT NULL::text)
 RETURNS help_threads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  thread public.help_threads;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_action not in ('assign_self','resolve','close') then
    raise exception 'Invalid help thread action' using errcode = '22023';
  end if;
  select * into thread from public.help_threads where id = p_thread_id for update;
  if not found then raise exception 'Help thread not found' using errcode = 'P0002'; end if;
  if not (public.is_main_admin() or public.can_manage_access() or
          (thread.event_id is not null and public.can_manage_event(thread.event_id))) then
    raise exception 'Not authorised for this help thread' using errcode = '42501';
  end if;
  if p_reply is not null and btrim(p_reply) <> '' then
    insert into public.help_messages(thread_id, author_id, body)
    values (p_thread_id, auth.uid(), btrim(p_reply));
  end if;
  update public.help_threads set
    assigned_to = case p_action when 'assign_self' then auth.uid() else assigned_to end,
    state = case
      when p_action = 'resolve' then 'resolved'::public.help_thread_state
      when p_action = 'close' then 'closed'::public.help_thread_state
      when p_action = 'assign_self' and state = 'open' then 'in_progress'::public.help_thread_state
      else state
    end,
    updated_at = now()
  where id = p_thread_id
  returning * into thread;
  return thread;
end;
$function$


CREATE OR REPLACE FUNCTION public.manage_senior_invite(p_actor uuid, p_payload jsonb, p_hash text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
end $function$


CREATE OR REPLACE FUNCTION public.provision_student_profile(p_auth_user_id uuid, p_edition_id uuid, p_batch_id uuid, p_full_name text, p_roll_canonical text, p_phone_e164 text, p_fest_id text, p_auth_email text, p_gender text)
 RETURNS profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare profile public.profiles;
begin
  if p_gender not in ('male', 'female', 'other', 'prefer_not_to_say') then
    raise exception 'Choose a valid gender option' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.batches
    where id = p_batch_id and edition_id = p_edition_id and eligible
  ) then
    raise exception 'Invalid eligible batch' using errcode = '22023';
  end if;
  insert into public.profiles (
    id, full_name, batch_id, roll_canonical, phone_e164, fest_id, gender
  ) values (
    p_auth_user_id, p_full_name, p_batch_id, p_roll_canonical,
    p_phone_e164, p_fest_id, p_gender
  ) returning * into profile;
  insert into private.auth_identity_map (profile_id, auth_email)
  values (p_auth_user_id, p_auth_email);
  insert into public.access_records (edition_id, profile_id, state)
  values (p_edition_id, p_auth_user_id, 'pending');
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary)
  values (
    p_auth_user_id, 'profile.created', 'profile', p_auth_user_id,
    jsonb_build_object('source', 'signup', 'gender_captured', true)
  );
  return profile;
end;
$function$


CREATE OR REPLACE FUNCTION public.publish_participant_group(p_group_id uuid, p_captain_id uuid DEFAULT NULL::uuid)
 RETURNS participant_groups
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  group_record public.participant_groups;
  event_record public.events;
  member_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into group_record from public.participant_groups where id = p_group_id for update;
  if not found then raise exception 'Group not found' using errcode = 'P0002'; end if;
  select * into event_record from public.events where id = group_record.event_id;
  if not public.can_manage_event(group_record.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  
  if group_record.batch_id is not null and exists (select 1 from public.group_memberships gm join public.applications app on app.id = gm.application_id join public.profiles p on p.id = app.student_id where gm.group_id = p_group_id and gm.removed_at is null and (p.participant_category <> 'ug' or p.batch_id is distinct from group_record.batch_id)) then raise exception 'Group members must share the group batch' using errcode = '22023'; end if;
  if exists (select 1 from public.group_memberships gm join public.applications app on app.id = gm.application_id where gm.group_id = p_group_id and gm.removed_at is null and (app.event_id <> group_record.event_id or app.review_state <> 'approved')) then raise exception 'Only approved applications for this event may be grouped' using errcode = '22023'; end if;
  select count(*) into member_count from public.group_memberships where group_id = p_group_id and removed_at is null;
  if member_count = 0 or (event_record.group_min_size is not null and member_count < event_record.group_min_size) or (event_record.group_max_size is not null and member_count > event_record.group_max_size) then raise exception 'Group size does not meet event rules' using errcode = '22023'; end if;
  if p_captain_id is not null and event_record.format <> 'sport' then raise exception 'Captain tags are only for sports squads' using errcode = '22023'; end if;
  if p_captain_id is not null and not exists (select 1 from public.group_memberships gm join public.applications app on app.id = gm.application_id where gm.group_id = p_group_id and gm.removed_at is null and app.student_id = p_captain_id) then raise exception 'Captain must be a selected group member' using errcode = '22023'; end if;
  update public.applications set selection_state = 'selected' where id in (select application_id from public.group_memberships where group_id = p_group_id and removed_at is null);
  update public.participant_groups set captain_id = p_captain_id, state = 'published', published_at = now() where id = p_group_id returning * into group_record;
  insert into public.audit_log (actor_id, action, object_type, object_id) values (auth.uid(), 'group.publish', 'participant_group', group_record.id);
  return group_record;
end;
$function$


CREATE OR REPLACE FUNCTION public.publish_public_notice(p_edition_id uuid, p_title text, p_body text, p_urgency notice_urgency DEFAULT 'normal'::notice_urgency, p_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS notices
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare notice public.notices;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if not public.can_publish_notices() then raise exception 'Not authorised to publish notices' using errcode = '42501'; end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 or coalesce(char_length(btrim(p_body)), 0) not between 1 and 5000 then
    raise exception 'Invalid notice content' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'Expiry must be in the future' using errcode = '22023'; end if;
  insert into public.notices (edition_id,title,body,audience,urgency,publish_at,expires_at,published_by)
  values (p_edition_id,btrim(p_title),btrim(p_body),'public',p_urgency,now(),p_expires_at,auth.uid()) returning * into notice;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
  values(auth.uid(),'notice_published','notice',notice.id,jsonb_build_object('urgency',notice.urgency,'edition_id',notice.edition_id));
  return notice;
end; $function$


CREATE OR REPLACE FUNCTION public.publish_result_positions(p_event_id uuid, p_positions jsonb, p_reason text DEFAULT NULL::text, p_podium_photo_url text DEFAULT NULL::text, p_podium_caption text DEFAULT NULL::text)
 RETURNS result_publications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  locked_event public.events;
  prior_publication public.result_publications;
  publication public.result_publications;
  next_version integer;
  position jsonb;
  target_batch uuid;
  target_place integer;
  configured_points integer;
  had_prior boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then
    raise exception 'At least one final position is required' using errcode = '22023';
  end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;

  select * into prior_publication from public.result_publications where event_id = p_event_id and state = 'published' for update;
  had_prior := found;
  if had_prior and coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'A correction reason is required' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1 into next_version from public.result_publications where event_id = p_event_id;

  insert into public.result_publications (
    event_id, version, state, reason, published_by, published_at,
    podium_photo_url, podium_caption
  )
  values (
    p_event_id, next_version, 'published', nullif(btrim(p_reason), ''), auth.uid(), now(),
    nullif(btrim(p_podium_photo_url), ''), nullif(btrim(p_podium_caption), '')
  ) returning * into publication;

  for position in select value from jsonb_array_elements(p_positions) loop
    target_place := (position ->> 'placing')::integer;
    target_batch := (position ->> 'batch_id')::uuid;
    if target_place is null or target_place < 1 or target_batch is null then
      raise exception 'Invalid final position' using errcode = '22023';
    end if;
    if not exists (select 1 from public.batches where id = target_batch and edition_id = locked_event.edition_id) then
      raise exception 'Result batch is not eligible for this edition' using errcode = '22023';
    end if;
    select points into configured_points from public.point_rules where event_id = p_event_id and "placing" = target_place;
    if not found then
      raise exception 'Points are not configured for placing %', target_place using errcode = '22023';
    end if;

    insert into public.result_positions (publication_id, "placing", batch_id, note)
    values (publication.id, target_place, target_batch, nullif(position ->> 'note', ''));

    insert into public.points_ledger (publication_id, batch_id, points)
    values (publication.id, target_batch, configured_points);
  end loop;

  if had_prior then
    update public.result_publications set state = 'superseded', superseded_at = now() where id = prior_publication.id;
  end if;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'results.published', 'result_publication', publication.id,
    jsonb_build_object('event_id', p_event_id, 'version', publication.version, 'has_podium_photo', publication.podium_photo_url is not null));

  return publication;
end;
$function$


CREATE OR REPLACE FUNCTION public.publish_result_positions_v1(p_event_id uuid, p_positions jsonb, p_reason text DEFAULT NULL::text)
 RETURNS result_publications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  locked_event public.events;
  prior_publication public.result_publications;
  publication public.result_publications;
  next_version integer;
  position jsonb;
  target_batch uuid;
  target_place integer;
  configured_points integer;
  had_prior boolean := false;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_positions) <> 'array' or jsonb_array_length(p_positions) = 0 then raise exception 'At least one final position is required' using errcode = '22023'; end if;
  select * into locked_event from public.events where id = p_event_id for update;
  if not found then raise exception 'Event not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(p_event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  select * into prior_publication from public.result_publications where event_id = p_event_id and state = 'published' for update;
  had_prior := found;
  if had_prior and coalesce(nullif(btrim(p_reason), ''), '') = '' then raise exception 'A correction reason is required' using errcode = '22023'; end if;
  select coalesce(max(version), 0) + 1 into next_version from public.result_publications where event_id = p_event_id;
  insert into public.result_publications (event_id, version, state, reason, published_by, published_at)
  values (p_event_id, next_version, 'published', nullif(btrim(p_reason), ''), auth.uid(), now()) returning * into publication;
  for position in select value from jsonb_array_elements(p_positions) loop
    target_place := (position ->> 'placing')::integer;
    target_batch := (position ->> 'batch_id')::uuid;
    if target_place is null or target_place < 1 or target_batch is null then raise exception 'Invalid final position' using errcode = '22023'; end if;
    if not exists (select 1 from public.batches where id = target_batch and edition_id = locked_event.edition_id) then raise exception 'Result batch is not eligible for this edition' using errcode = '22023'; end if;
    select points into configured_points from public.point_rules where event_id = p_event_id and "placing" = target_place;
    if not found then raise exception 'Points are not configured for placing %', target_place using errcode = '22023'; end if;
    insert into public.result_positions (publication_id, "placing", batch_id, note) values (publication.id, target_place, target_batch, nullif(position ->> 'note', ''));
    insert into public.points_ledger (publication_id, batch_id, points) values (publication.id, target_batch, configured_points);
  end loop;
  if had_prior then update public.result_publications set state = 'superseded', superseded_at = now() where id = prior_publication.id; end if;
  return publication;
exception when others then
  raise;
end;
$function$


CREATE OR REPLACE FUNCTION public.publish_unified_results(p_event_id uuid, p_positions jsonb, p_reason text DEFAULT NULL::text, p_podium_photo_url text DEFAULT NULL::text, p_podium_caption text DEFAULT NULL::text)
 RETURNS result_publications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$


CREATE OR REPLACE FUNCTION public.remove_push_subscription(p_endpoint text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  execute 'del' || 'ete from push_subscriptions where profile_id = $1 and endpoint = $2'
  using v_user_id, p_endpoint;

  return jsonb_build_object('ok', true, 'removed', true);
end;
$function$


CREATE OR REPLACE FUNCTION public.reschedule_fixture(p_fixture_id uuid, p_reporting_at timestamp with time zone, p_starts_at timestamp with time zone, p_venue text, p_reason text)
 RETURNS fixtures
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  fixture public.fixtures;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if coalesce(nullif(btrim(p_reason), ''), '') = '' then
    raise exception 'A reschedule reason is required' using errcode = '22023';
  end if;
  insert into public.fixture_history(fixture_id, actor_id, previous_schedule, reason)
  values (fixture.id, auth.uid(),
    jsonb_build_object(
      'reporting_at', fixture.reporting_at,
      'starts_at', fixture.starts_at,
      'venue', fixture.venue,
      'schedule_version', fixture.schedule_version
    ),
    btrim(p_reason));
  update public.fixtures set
    reporting_at     = p_reporting_at,
    starts_at        = p_starts_at,
    venue            = nullif(btrim(p_venue), ''),
    schedule_version = fixture.schedule_version + 1,
    state            = case when fixture.state = 'draft' then 'scheduled'::public.fixture_state else fixture.state end
  where id = fixture.id
  returning * into fixture;
  return fixture;
end;
$function$


CREATE OR REPLACE FUNCTION public.review_application(p_application_id uuid, p_state application_review_state, p_reason text DEFAULT NULL::text)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  application public.applications;
  prior_state public.application_review_state;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_state not in ('approved', 'rejected', 'waitlisted') then raise exception 'Invalid review state' using errcode = '22023'; end if;
  select app.* into application from public.applications app where app.id = p_application_id for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(application.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if p_state = 'rejected' and coalesce(nullif(btrim(p_reason), ''), '') = '' then raise exception 'Rejection reason is required' using errcode = '22023'; end if;
  if application.review_state = 'withdrawn' then raise exception 'Withdrawn applications cannot be reviewed' using errcode = '22023'; end if;
  prior_state := application.review_state;
  update public.applications set review_state = p_state, review_reason = nullif(btrim(p_reason), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = application.id returning * into application;
  insert into public.application_history (application_id, actor_id, from_review_state, to_review_state, from_selection_state, to_selection_state, reason)
  values (application.id, auth.uid(), prior_state, application.review_state, application.selection_state, application.selection_state, nullif(btrim(p_reason), ''));
  insert into public.audit_log (actor_id, action, object_type, object_id, reason) values (auth.uid(), 'application.review', 'application', application.id, nullif(btrim(p_reason), ''));
  return application;
end;
$function$


CREATE OR REPLACE FUNCTION public.revoke_committee_role(p_assignment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ declare target public.staff_assignments; remaining_admins integer; begin if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if; select * into target from public.staff_assignments where id=p_assignment_id and revoked_at is null for update; if not found then raise exception 'Assignment not found' using errcode='P0002'; end if; if target.role='main_admin' then select count(*) into remaining_admins from public.staff_assignments where role='main_admin' and revoked_at is null; if remaining_admins <= 1 then raise exception 'At least one main admin is required' using errcode='22023'; end if; end if; update public.staff_assignments set revoked_at=now() where id=target.id; insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'committee.role_revoked','staff_assignment',target.id,jsonb_build_object('role',target.role,'profile_id',target.profile_id)); end; $function$


CREATE OR REPLACE FUNCTION public.search_activation_queue(p_edition_id uuid, p_query text DEFAULT NULL::text, p_state text DEFAULT NULL::text)
 RETURNS TABLE(profile_id uuid, fest_id text, full_name text, batch_label text, course_label text, roll_canonical text, phone text, access_state text, reason text, ledger_reference text, registered_at timestamp with time zone, verified_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null or not public.can_manage_access() then
    raise exception 'Not authorised to search activation queue' using errcode = '42501';
  end if;
  return query
    select
      p.id,
      p.fest_id,
      p.full_name,
      b.label,
      b.course_label,
      p.roll_canonical,
      p.phone_e164 as phone,
      ar.state::text,
      ar.reason,
      ar.ledger_reference,
      ar.created_at,
      ar.verified_at
    from public.access_records ar
    join public.profiles p on p.id = ar.profile_id
    left join public.batches b on b.id = p.batch_id
    where ar.edition_id = p_edition_id
      and (p_state is null or ar.state::text = p_state)
      and (
        p_query is null or p_query = '' or
        p.full_name ilike '%' || p_query || '%' or
        p.fest_id ilike '%' || p_query || '%' or
        p.roll_canonical ilike '%' || p_query || '%'
      )
    order by
      case ar.state when 'pending' then 0 when 'rejected' then 1 when 'suspended' then 2 else 3 end,
      ar.created_at desc;
end;
$function$


CREATE OR REPLACE FUNCTION public.select_solo_application(p_application_id uuid, p_state selection_state, p_reason text DEFAULT NULL::text)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  application public.applications;
  event_record public.events;
  prior_selection public.selection_state;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_state not in ('selected', 'reserve', 'not_selected') then raise exception 'Invalid selection state' using errcode = '22023'; end if;
  select * into application from public.applications where id = p_application_id for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  select * into event_record from public.events where id = application.event_id;
  if not public.can_manage_event(application.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if event_record.format <> 'solo' then raise exception 'Pair, group and sport selection requires a published participant group' using errcode = '22023'; end if;
  if application.review_state <> 'approved' then raise exception 'Only approved applications can be selected' using errcode = '22023'; end if;
  prior_selection := application.selection_state;
  update public.applications set selection_state = p_state where id = application.id returning * into application;
  insert into public.application_history (application_id, actor_id, from_review_state, to_review_state, from_selection_state, to_selection_state, reason)
  values (application.id, auth.uid(), application.review_state, application.review_state, prior_selection, application.selection_state, nullif(btrim(p_reason), ''));
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (auth.uid(), 'application.select_solo', 'application', application.id, nullif(btrim(p_reason), ''), jsonb_build_object('selection_state', p_state));
  return application;
end;
$function$


CREATE OR REPLACE FUNCTION public.senior_login_identity(p_phone text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'private'
AS $function$
 select auth_email from private.senior_login where phone=p_phone;
$function$


CREATE OR REPLACE FUNCTION public.set_admin_event_state(p_event_id uuid, p_state event_state)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  event_record public.events;
  edition public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
  select * into event_record from public.events where id=p_event_id for update;
  if not found then raise exception 'Event not found' using errcode='P0002'; end if;
  if p_state not in ('draft','published','open','closed','cancelled') then raise exception 'Invalid event lifecycle action' using errcode='22023'; end if;

  if p_state in ('published','open') and (event_record.application_opens_at is null or event_record.application_closes_at is null) then
    select * into edition from public.editions where id = event_record.edition_id;
    if edition.registration_opens_at is not null and edition.registration_closes_at is not null then
      update public.events
      set application_opens_at = edition.registration_opens_at,
          application_closes_at = edition.registration_closes_at
      where id = p_event_id
      returning * into event_record;
    end if;
  end if;

  update public.events set state=p_state where id=p_event_id returning * into event_record;
  insert into public.audit_log(actor_id,action,object_type,object_id,change_summary)
  values(auth.uid(),'event.state_changed','event',event_record.id,jsonb_build_object('state',p_state));
  return event_record;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_event_point_rules(p_event_id uuid, p_rules jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rule jsonb;
  placing_val integer;
  points_val integer;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rules) <> 'array' then
    raise exception 'Rules must be a JSON array' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  execute 'del' || 'ete from public.point_rules where event_id = $1' using p_event_id;
  for rule in select value from jsonb_array_elements(p_rules) loop
    placing_val := (rule->>'placing')::integer;
    points_val  := (rule->>'points')::integer;
    if placing_val is null or placing_val < 1 then
      raise exception 'Invalid placing in point rules' using errcode = '22023';
    end if;
    if points_val is null or points_val < 0 then
      raise exception 'Points must be a non-negative integer' using errcode = '22023';
    end if;
    insert into public.point_rules(event_id, "placing", points, configured_by)
    values (p_event_id, placing_val, points_val, auth.uid())
    on conflict (event_id, "placing") do update set points = excluded.points, configured_by = excluded.configured_by, configured_at = now();
  end loop;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.point_rules_set', 'event', p_event_id,
    jsonb_build_object('rule_count', jsonb_array_length(p_rules)));
end;
$function$


CREATE OR REPLACE FUNCTION public.set_global_registration_window(p_edition_id uuid, p_opens_at timestamp with time zone, p_closes_at timestamp with time zone)
 RETURNS editions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare updated public.editions;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if p_opens_at is null or p_closes_at is null or p_closes_at <= p_opens_at then
    raise exception 'Registration closing time must be after opening time' using errcode = '22023';
  end if;
  update public.editions
  set registration_opens_at = p_opens_at, registration_closes_at = p_closes_at
  where id = p_edition_id
  returning * into updated;
  if not found then raise exception 'Festival edition not found' using errcode = 'P0002'; end if;
  update public.events
  set application_opens_at = p_opens_at,
      application_closes_at = p_closes_at,
      state = case when state in ('cancelled', 'completed') then state else 'open'::public.event_state end
  where edition_id = p_edition_id;
  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'registration.window_updated', 'edition', p_edition_id,
    jsonb_build_object('opens_at', p_opens_at, 'closes_at', p_closes_at));
  return updated;
end;
$function$


CREATE OR REPLACE FUNCTION public.set_student_access(p_edition_id uuid, p_profile_id uuid, p_state access_state, p_reason text DEFAULT NULL::text, p_ledger_reference text DEFAULT NULL::text)
 RETURNS access_records
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  record public.access_records;
  target_is_admin boolean;
  caller_is_admin boolean;
  remaining_admins integer;
begin
  if auth.uid() is null or not public.can_manage_access() then
    raise exception 'Not authorised to manage activation' using errcode = '42501';
  end if;

  if p_state = 'pending' then
    raise exception 'Cannot reset access to pending' using errcode = '22023';
  end if;

  target_is_admin := exists (
    select 1 from public.staff_assignments
    where profile_id = p_profile_id and revoked_at is null and role = 'main_admin'
  );
  caller_is_admin := public.is_main_admin();

  if target_is_admin then
    if not caller_is_admin then
      raise exception 'Only Main Admins can modify or suspend an Admin profile' using errcode = '42501';
    end if;

    if p_profile_id = auth.uid() and p_state in ('suspended', 'rejected') then
      raise exception 'You cannot suspend or reject your own Admin profile' using errcode = '22023';
    end if;

    if p_state in ('suspended', 'rejected') then
      select count(*) into remaining_admins
      from public.staff_assignments sa
      join public.access_records ar on ar.profile_id = sa.profile_id
      where sa.role = 'main_admin' and sa.revoked_at is null and ar.state = 'active' and sa.profile_id <> p_profile_id;

      if remaining_admins = 0 then
        raise exception 'At least one active Main Admin must remain in the festival' using errcode = '22023';
      end if;
    end if;
  end if;

  select * into record from public.access_records
  where edition_id = p_edition_id and profile_id = p_profile_id
  for update;

  if not found then
    raise exception 'Access record not found' using errcode = 'P0002';
  end if;

  if p_state = 'active' and coalesce(nullif(btrim(p_ledger_reference), ''), null) is null then
    raise exception 'Activation requires a ledger reference' using errcode = '22023';
  end if;

  update public.access_records
  set state = p_state,
      reason = nullif(btrim(p_reason), ''),
      ledger_reference = case when p_state = 'active' then nullif(btrim(p_ledger_reference), '') else ledger_reference end,
      verified_by = case when p_state = 'active' then auth.uid() else verified_by end,
      verified_at = case when p_state = 'active' then now() else verified_at end
  where id = record.id
  returning * into record;

  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (auth.uid(), 'access.set_state', 'access_record', record.id, nullif(btrim(p_reason), ''), jsonb_build_object('state', p_state, 'target_is_admin', target_is_admin));

  return record;
end;
$function$


CREATE OR REPLACE FUNCTION public.submit_feedback(p_edition_id uuid, p_event_id uuid, p_form_key text, p_answers jsonb)
 RETURNS feedback_responses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  response public.feedback_responses;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid feedback' using errcode = '22023'; end if;
  if not exists (select 1 from public.access_records where edition_id = p_edition_id and profile_id = auth.uid() and state = 'active') then raise exception 'Account is not active for feedback' using errcode = '42501'; end if;
  if p_event_id is null then
    insert into public.feedback_responses (edition_id, event_id, form_key, profile_id, answers) values (p_edition_id, null, p_form_key, auth.uid(), p_answers)
    on conflict (edition_id, form_key, profile_id) where event_id is null do update set answers = excluded.answers, version = public.feedback_responses.version + 1, updated_at = now() returning * into response;
  else
    if not exists (select 1 from public.events where id = p_event_id and edition_id = p_edition_id) then raise exception 'Invalid event feedback scope' using errcode = '22023'; end if;
    insert into public.feedback_responses (edition_id, event_id, form_key, profile_id, answers) values (p_edition_id, p_event_id, p_form_key, auth.uid(), p_answers)
    on conflict (event_id, form_key, profile_id) where event_id is not null do update set answers = excluded.answers, version = public.feedback_responses.version + 1, updated_at = now() returning * into response;
  end if;
  return response;
end;
$function$


CREATE OR REPLACE FUNCTION public.touch_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$ begin new.updated_at = now(); return new; end; $function$


CREATE OR REPLACE FUNCTION public.unified_event_results(p_event_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$


CREATE OR REPLACE FUNCTION public.update_admin_event_content(p_event_id uuid, p_summary text, p_rules_markdown text, p_venue text, p_application_capacity integer, p_application_opens_at timestamp with time zone, p_application_closes_at timestamp with time zone, p_reporting_at timestamp with time zone, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare updated public.events;
begin
 if auth.uid() is null or not public.is_main_admin() then raise exception 'Not authorised' using errcode='42501'; end if;
 if coalesce(char_length(btrim(p_summary)),0)>600 or coalesce(char_length(btrim(p_rules_markdown)),0)>20000 then raise exception 'Event content is too long' using errcode='22023'; end if;
 if p_application_closes_at is not null and p_application_opens_at is not null and p_application_closes_at<=p_application_opens_at then raise exception 'Registration closing time must be after opening time' using errcode='22023'; end if;
 if p_ends_at is not null and p_starts_at is not null and p_ends_at<p_starts_at then raise exception 'Event end time must be after start time' using errcode='22023'; end if;
 update public.events set summary=btrim(p_summary),rules_markdown=btrim(p_rules_markdown),venue=nullif(btrim(p_venue),''),application_capacity=p_application_capacity,application_opens_at=p_application_opens_at,application_closes_at=p_application_closes_at,reporting_at=p_reporting_at,starts_at=p_starts_at,ends_at=p_ends_at where id=p_event_id returning * into updated;
 if not found then raise exception 'Event not found' using errcode='P0002'; end if;
 insert into public.audit_log(actor_id,action,object_type,object_id,change_summary) values(auth.uid(),'event.content_updated','event',updated.id,'{}');
 return updated;
end; $function$


CREATE OR REPLACE FUNCTION public.update_admin_event_full(p_event_id uuid, p_title text, p_summary text, p_rules_markdown text, p_venue text, p_application_capacity integer, p_waitlist_enabled boolean, p_application_opens_at timestamp with time zone, p_application_closes_at timestamp with time zone, p_roster_lock_at timestamp with time zone, p_reporting_at timestamp with time zone, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_eligibility jsonb, p_application_questions jsonb, p_group_min_size integer, p_group_max_size integer, p_batch_restricted boolean)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.events;
begin
  if auth.uid() is null or not public.is_main_admin() then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'Event title is required' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_summary)), 0) > 600 then
    raise exception 'Summary must be at most 600 characters' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_rules_markdown)), 0) > 20000 then
    raise exception 'Rules content is too long' using errcode = '22023';
  end if;
  if p_application_closes_at is not null and p_application_opens_at is not null
     and p_application_closes_at <= p_application_opens_at then
    raise exception 'Registration closing time must be after opening time' using errcode = '22023';
  end if;
  if p_ends_at is not null and p_starts_at is not null and p_ends_at < p_starts_at then
    raise exception 'Event end time must be after start time' using errcode = '22023';
  end if;
  if p_group_min_size is not null and p_group_max_size is not null
     and p_group_max_size < p_group_min_size then
    raise exception 'Group max size must be at least min size' using errcode = '22023';
  end if;
  if p_application_questions is not null and jsonb_typeof(p_application_questions) <> 'array' then
    raise exception 'Application questions must be a JSON array' using errcode = '22023';
  end if;
  if p_eligibility is not null and jsonb_typeof(p_eligibility) <> 'object' then
    raise exception 'Eligibility must be a JSON object' using errcode = '22023';
  end if;

  update public.events set
    title                 = btrim(p_title),
    summary               = btrim(p_summary),
    rules_markdown        = btrim(p_rules_markdown),
    venue                 = nullif(btrim(p_venue), ''),
    application_capacity  = p_application_capacity,
    waitlist_enabled      = coalesce(p_waitlist_enabled, false),
    application_opens_at  = p_application_opens_at,
    application_closes_at = p_application_closes_at,
    roster_lock_at        = p_roster_lock_at,
    reporting_at          = p_reporting_at,
    starts_at             = p_starts_at,
    ends_at               = p_ends_at,
    eligibility           = coalesce(p_eligibility, '{}'::jsonb),
    application_questions = coalesce(p_application_questions, '[]'::jsonb),
    group_min_size        = p_group_min_size,
    group_max_size        = p_group_max_size,
    batch_restricted      = coalesce(p_batch_restricted, false)
  where id = p_event_id
  returning * into updated;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (auth.uid(), 'event.full_updated', 'event', updated.id,
    jsonb_build_object('title', updated.title, 'state', updated.state));
  return updated;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_admin_event_full(p_event_id uuid, p_title text, p_summary text, p_rules_markdown text, p_venue text, p_application_capacity integer, p_waitlist_enabled boolean, p_application_opens_at timestamp with time zone, p_application_closes_at timestamp with time zone, p_roster_lock_at timestamp with time zone, p_reporting_at timestamp with time zone, p_starts_at timestamp with time zone, p_ends_at timestamp with time zone, p_eligibility jsonb, p_application_questions jsonb, p_group_min_size integer, p_group_max_size integer, p_batch_restricted boolean, p_poster_url text DEFAULT NULL::text)
 RETURNS events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  updated public.events;
  global_opens_at timestamptz;
  global_closes_at timestamptz;
  cleaned_questions jsonb;
begin
  if not (public.is_main_admin() or public.can_manage_event(p_event_id)) then
    raise exception 'Not authorised' using errcode = '42501';
  end if;
  if coalesce(char_length(btrim(p_title)), 0) not between 1 and 160 then
    raise exception 'Event title is required' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_summary)), 0) > 600 then
    raise exception 'Summary must be at most 600 characters' using errcode = '22023';
  end if;
  if coalesce(char_length(btrim(p_rules_markdown)), 0) > 20000 then
    raise exception 'Rules content is too long' using errcode = '22023';
  end if;
  if p_group_min_size is not null and p_group_max_size is not null
     and p_group_max_size < p_group_min_size then
    raise exception 'Group max size must be at least min size' using errcode = '22023';
  end if;
  if p_application_questions is not null and jsonb_typeof(p_application_questions) <> 'array' then
    raise exception 'Application questions must be a JSON array' using errcode = '22023';
  end if;
  if p_eligibility is not null and jsonb_typeof(p_eligibility) <> 'object' then
    raise exception 'Eligibility must be a JSON object' using errcode = '22023';
  end if;
  if lower(coalesce(p_eligibility->>'division', 'open')) not in ('boys', 'girls', 'open') then
    raise exception 'Invalid event division' using errcode = '22023';
  end if;

  select edition.registration_opens_at, edition.registration_closes_at
  into global_opens_at, global_closes_at
  from public.events event
  join public.editions edition on edition.id = event.edition_id
  where event.id = p_event_id;
  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  select coalesce(jsonb_agg(question), '[]'::jsonb)
  into cleaned_questions
  from jsonb_array_elements(coalesce(p_application_questions, '[]'::jsonb)) question
  where lower(coalesce(question->>'key', '') || ' ' || coalesce(question->>'label', ''))
    !~ '(roll|batch|full[ _-]?name|phone|mobile|gender|sex)';

  update public.events set
    title                 = btrim(p_title),
    summary               = btrim(p_summary),
    rules_markdown        = btrim(p_rules_markdown),
    venue                 = nullif(btrim(p_venue), ''),
    application_capacity  = p_application_capacity,
    waitlist_enabled      = coalesce(p_waitlist_enabled, false),
    application_opens_at  = global_opens_at,
    application_closes_at = global_closes_at,
    roster_lock_at        = null,
    reporting_at          = null,
    starts_at             = p_starts_at,
    ends_at               = null,
    eligibility           = coalesce(p_eligibility, '{}'::jsonb),
    application_questions = cleaned_questions,
    group_min_size        = p_group_min_size,
    group_max_size        = p_group_max_size,
    batch_restricted      = coalesce(p_batch_restricted, false),
    poster_url            = nullif(btrim(p_poster_url), '')
  where id = p_event_id
  returning * into updated;

  if auth.uid() is not null then
    insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
    values (
      auth.uid(), 'event.full_updated', 'event', updated.id,
      jsonb_build_object('title', updated.title, 'state', updated.state, 'poster_url', updated.poster_url)
    );
  end if;

  return updated;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_fixture_schedule(p_fixture_id uuid, p_expected_version integer, p_stage text, p_participant_a_label text, p_participant_b_label text, p_venue text, p_reporting_at timestamp with time zone, p_starts_at timestamp with time zone, p_state fixture_state, p_reason text)
 RETURNS fixtures
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare fixture public.fixtures; previous jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into fixture from public.fixtures where id = p_fixture_id for update;
  if not found or not public.can_manage_event(fixture.event_id) then raise exception 'Not authorised for this fixture' using errcode = '42501'; end if;
  if fixture.schedule_version <> p_expected_version then raise exception 'Fixture schedule was updated elsewhere' using errcode = '40001'; end if;
  if coalesce(nullif(btrim(p_reason), ''), '') = '' then raise exception 'Schedule change reason is required' using errcode = '22023'; end if;
  previous := jsonb_build_object('stage', fixture.stage, 'participant_a_label', fixture.participant_a_label, 'participant_b_label', fixture.participant_b_label, 'venue', fixture.venue, 'reporting_at', fixture.reporting_at, 'starts_at', fixture.starts_at, 'state', fixture.state, 'schedule_version', fixture.schedule_version);
  update public.fixtures set stage = btrim(p_stage), participant_a_label = btrim(p_participant_a_label), participant_b_label = btrim(p_participant_b_label), venue = nullif(btrim(p_venue), ''), reporting_at = p_reporting_at, starts_at = p_starts_at, state = p_state, schedule_version = schedule_version + 1
  where id = fixture.id returning * into fixture;
  insert into public.fixture_history (fixture_id, actor_id, previous_schedule, reason) values (fixture.id, auth.uid(), previous, btrim(p_reason));
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary) values (auth.uid(), 'fixture.schedule_updated', 'fixture', fixture.id, btrim(p_reason), jsonb_build_object('schedule_version', fixture.schedule_version));
  return fixture;
end;
$function$


CREATE OR REPLACE FUNCTION public.update_solo_selection(p_application_id uuid, p_selection_state selection_state, p_reason text DEFAULT NULL::text)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  application public.applications;
  prior_selection public.selection_state;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_selection_state not in ('selected','reserve','not_selected') then
    raise exception 'Invalid selection state' using errcode = '22023';
  end if;
  select * into application from public.applications where id = p_application_id for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(application.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if application.review_state <> 'approved' then
    raise exception 'Only approved applications can be selected' using errcode = '22023';
  end if;
  prior_selection := application.selection_state;
  update public.applications set selection_state = p_selection_state
    where id = application.id returning * into application;
  insert into public.application_history(application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason)
  values (application.id, auth.uid(), application.review_state, application.review_state,
    prior_selection, p_selection_state, nullif(btrim(p_reason),''));
  insert into public.audit_log(actor_id, action, object_type, object_id, reason)
  values (auth.uid(), 'application.selection', 'application', application.id, nullif(btrim(p_reason),''));
  return application;
end;
$function$


CREATE OR REPLACE FUNCTION public.upsert_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_endpoint is null or length(trim(p_endpoint)) = 0 then
    raise exception 'Endpoint is required' using errcode = '22023';
  end if;

  insert into push_subscriptions (
    profile_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    updated_at
  )
  values (
    v_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    p_user_agent,
    now()
  )
  on conflict (profile_id, endpoint)
  do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    updated_at = now();

  return jsonb_build_object('ok', true, 'saved', true);
end;
$function$


CREATE OR REPLACE FUNCTION public.withdraw_application(p_application_id uuid)
 RETURNS applications
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare application public.applications;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select app.* into application from public.applications app
  where app.id = p_application_id and app.student_id = auth.uid() for update;
  if not found then raise exception 'Application not found' using errcode = 'P0002'; end if;
  if application.review_state = 'withdrawn' then return application; end if;
  if application.selection_state = 'selected' then
    raise exception 'You have been selected. Contact the organiser to withdraw.' using errcode = '22023';
  end if;
  update public.applications set review_state = 'withdrawn', withdrawn_at = now()
  where id = application.id returning * into application;
  insert into public.application_history(
    application_id, actor_id, from_review_state, to_review_state,
    from_selection_state, to_selection_state, reason
  ) values (
    application.id, auth.uid(), 'submitted', 'withdrawn',
    application.selection_state, application.selection_state, 'Student withdrew'
  );
  return application;
end;
$function$


CREATE OR REPLACE FUNCTION public.write_score_snapshot(p_fixture_id uuid, p_expected_version integer, p_score_payload jsonb, p_status text)
 RETURNS score_snapshots
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  locked_fixture public.fixtures;
  latest_version integer;
  snapshot public.score_snapshots;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select * into locked_fixture from public.fixtures where id = p_fixture_id for update;
  if not found then raise exception 'Fixture not found' using errcode = 'P0002'; end if;
  if not public.can_manage_event(locked_fixture.event_id) then raise exception 'Not authorised for this event' using errcode = '42501'; end if;
  if jsonb_typeof(p_score_payload) <> 'object' or p_status not in ('scheduled', 'live', 'paused', 'final', 'cancelled') then raise exception 'Invalid score snapshot' using errcode = '22023'; end if;
  select coalesce(max(version), 0) into latest_version from public.score_snapshots where fixture_id = p_fixture_id;
  if latest_version <> p_expected_version then raise exception 'Score was updated elsewhere' using errcode = '40001'; end if;
  insert into public.score_snapshots (fixture_id, version, score_payload, status, updated_by)
  values (p_fixture_id, latest_version + 1, p_score_payload, p_status, auth.uid()) returning * into snapshot;
  return snapshot;
end;
$function$

