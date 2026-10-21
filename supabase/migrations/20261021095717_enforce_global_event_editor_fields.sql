-- Keep the simplified event-editor rules true even when the RPC is called
-- directly: registration dates belong to the edition, and retired timing
-- fields are always cleared on every editor save.
create or replace function public.update_admin_event_full(
  p_event_id uuid,
  p_title text,
  p_summary text,
  p_rules_markdown text,
  p_venue text,
  p_application_capacity integer,
  p_waitlist_enabled boolean,
  p_application_opens_at timestamptz,
  p_application_closes_at timestamptz,
  p_roster_lock_at timestamptz,
  p_reporting_at timestamptz,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_eligibility jsonb,
  p_application_questions jsonb,
  p_group_min_size integer,
  p_group_max_size integer,
  p_batch_restricted boolean,
  p_poster_url text default null
)
returns public.events
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.events;
  global_opens_at timestamptz;
  global_closes_at timestamptz;
  cleaned_questions jsonb;
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

  insert into public.audit_log(actor_id, action, object_type, object_id, change_summary)
  values (
    auth.uid(), 'event.full_updated', 'event', updated.id,
    jsonb_build_object('title', updated.title, 'state', updated.state, 'poster_url', updated.poster_url)
  );
  return updated;
end;
$$;

revoke all on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) from public, anon;
grant execute on function public.update_admin_event_full(uuid,text,text,text,text,integer,boolean,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,timestamptz,jsonb,jsonb,integer,integer,boolean,text) to authenticated;

notify pgrst, 'reload schema';
