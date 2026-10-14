-- Complete the core Phase 1-2 operations: audited activation, head review, and head-created squads/groups.

alter table public.access_records drop constraint access_records_check;
alter table public.access_records add constraint active_access_has_verification check (state <> 'active' or verified_at is not null);

alter table public.events add column group_min_size integer check (group_min_size is null or group_min_size > 0);
alter table public.events add column group_max_size integer check (group_max_size is null or group_max_size > 0);
alter table public.events add column batch_restricted boolean not null default false;
alter table public.events add constraint event_group_size_range check (group_max_size is null or group_min_size is null or group_max_size >= group_min_size);

create type public.group_state as enum ('draft', 'published', 'disbanded');

create table public.participant_groups (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  batch_id uuid references public.batches(id),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  captain_id uuid references public.profiles(id),
  state public.group_state not null default 'draft',
  published_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((state = 'published') = (published_at is not null))
);

create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.participant_groups(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete restrict,
  added_by uuid not null references public.profiles(id),
  added_at timestamptz not null default now(),
  removed_at timestamptz
);
create unique index active_group_membership_once_per_application on public.group_memberships(application_id) where removed_at is null;
create unique index active_group_membership_once_per_group on public.group_memberships(group_id, application_id) where removed_at is null;

create trigger participant_groups_touch_updated_at before update on public.participant_groups for each row execute function public.touch_updated_at();

alter table public.participant_groups enable row level security;
alter table public.group_memberships enable row level security;
create policy groups_visible_to_own_member on public.participant_groups for select to authenticated using (
  exists (select 1 from public.group_memberships gm join public.applications app on app.id = gm.application_id where gm.group_id = participant_groups.id and gm.removed_at is null and app.student_id = auth.uid())
);
create policy memberships_visible_to_own_member on public.group_memberships for select to authenticated using (
  exists (select 1 from public.applications app where app.id = application_id and app.student_id = auth.uid())
);

create or replace function public.can_manage_access()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.staff_assignments where profile_id = auth.uid() and revoked_at is null and role in ('main_admin', 'treasurer'));
$$;
revoke all on function public.can_manage_access() from public;
grant execute on function public.can_manage_access() to authenticated;

create or replace function public.set_student_access(
  p_edition_id uuid, p_profile_id uuid, p_state public.access_state, p_reason text default null, p_ledger_reference text default null
)
returns public.access_records
language plpgsql security definer set search_path = public as $$
declare
  record public.access_records;
begin
  if auth.uid() is null or not public.can_manage_access() then raise exception 'Not authorised to manage activation' using errcode = '42501'; end if;
  if p_state = 'pending' then raise exception 'Cannot reset access to pending' using errcode = '22023'; end if;
  select * into record from public.access_records where edition_id = p_edition_id and profile_id = p_profile_id for update;
  if not found then raise exception 'Access record not found' using errcode = 'P0002'; end if;
  if p_state = 'active' and coalesce(nullif(btrim(p_ledger_reference), ''), null) is null then raise exception 'Activation requires a ledger reference' using errcode = '22023'; end if;
  update public.access_records set state = p_state, reason = nullif(btrim(p_reason), ''), ledger_reference = case when p_state = 'active' then nullif(btrim(p_ledger_reference), '') else ledger_reference end,
    verified_by = case when p_state = 'active' then auth.uid() else verified_by end,
    verified_at = case when p_state = 'active' then now() else verified_at end
  where id = record.id returning * into record;
  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary) values (auth.uid(), 'access.set_state', 'access_record', record.id, nullif(btrim(p_reason), ''), jsonb_build_object('state', p_state));
  return record;
end;
$$;

create or replace function public.review_application(
  p_application_id uuid, p_state public.application_review_state, p_reason text default null
)
returns public.applications
language plpgsql security definer set search_path = public as $$
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
$$;

create or replace function public.publish_participant_group(
  p_group_id uuid, p_captain_id uuid default null
)
returns public.participant_groups
language plpgsql security definer set search_path = public as $$
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
  if event_record.batch_restricted and group_record.batch_id is null then raise exception 'This event requires a batch-specific group' using errcode = '22023'; end if;
  if event_record.batch_restricted and exists (select 1 from public.group_memberships gm join public.applications app on app.id = gm.application_id join public.profiles p on p.id = app.student_id where gm.group_id = p_group_id and gm.removed_at is null and p.batch_id <> group_record.batch_id) then raise exception 'Group members must share the group batch' using errcode = '22023'; end if;
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
$$;

revoke all on function public.set_student_access(uuid, uuid, public.access_state, text, text) from public;
grant execute on function public.set_student_access(uuid, uuid, public.access_state, text, text) to authenticated;
revoke all on function public.review_application(uuid, public.application_review_state, text) from public;
grant execute on function public.review_application(uuid, public.application_review_state, text) to authenticated;
revoke all on function public.publish_participant_group(uuid, uuid) from public;
grant execute on function public.publish_participant_group(uuid, uuid) to authenticated;

create or replace function public.create_participant_group(p_event_id uuid, p_name text, p_batch_id uuid default null)
returns public.participant_groups
language plpgsql security definer set search_path = public as $$
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
$$;

create or replace function public.add_group_member(p_group_id uuid, p_application_id uuid)
returns public.group_memberships
language plpgsql security definer set search_path = public as $$
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
$$;

revoke all on function public.create_participant_group(uuid, text, uuid) from public;
grant execute on function public.create_participant_group(uuid, text, uuid) to authenticated;
revoke all on function public.add_group_member(uuid, uuid) from public;
grant execute on function public.add_group_member(uuid, uuid) to authenticated;
