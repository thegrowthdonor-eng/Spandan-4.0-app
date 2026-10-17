-- ====================================================================
-- SPANDAN 4.0: Migration 000007 - Web Push Notifications Infrastructure
-- In accordance with Requirement R17 (Browser Push Reminders & Alerts)
-- ====================================================================

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_push_profile_endpoint unique (profile_id, endpoint)
);

create index if not exists idx_push_sub_profile on push_subscriptions(profile_id);

alter table push_subscriptions enable row level security;

-- RLS: Users can only see and manage their own device push subscriptions
drop policy if exists push_sub_own on push_subscriptions;
create policy push_sub_own on push_subscriptions
  for all
  using (auth.uid() = profile_id)
  with check (auth.uid() = profile_id);

-- RPC: Upsert push subscription for current authenticated user
create or replace function upsert_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
$$;

-- RPC: Remove push subscription on logout or toggle off
create or replace function remove_push_subscription(
  p_endpoint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from push_subscriptions
  where profile_id = v_user_id
    and endpoint = p_endpoint;

  return jsonb_build_object('ok', true, 'removed', true);
end;
$$;

-- RPC: Admin / System helper to retrieve push endpoints for broadcast / target notifications
create or replace function get_push_recipients(
  p_profile_ids uuid[] default null
)
returns table (
  profile_id uuid,
  endpoint text,
  p256dh text,
  auth text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only main admin, notice publisher, or event head can retrieve push endpoints
  if not (
    can_manage_access() or 
    can_publish_notices() or 
    exists (select 1 from event_heads where head_id = auth.uid())
  ) then
    raise exception 'Not authorised to dispatch push notifications' using errcode = '42501';
  end if;

  if p_profile_ids is not null and array_length(p_profile_ids, 1) > 0 then
    return query
    select ps.profile_id, ps.endpoint, ps.p256dh, ps.auth
    from push_subscriptions ps
    where ps.profile_id = any(p_profile_ids);
  else
    return query
    select ps.profile_id, ps.endpoint, ps.p256dh, ps.auth
    from push_subscriptions ps;
  end if;
end;
$$;
