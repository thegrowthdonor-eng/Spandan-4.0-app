-- Persistent, non-PII rate-limit bucket used before password authentication attempts.
create table private.auth_rate_limits (
  key_hash text primary key check (key_hash ~ '^[a-f0-9]{64}$'),
  bucket_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);
revoke all on table private.auth_rate_limits from anon, authenticated;

create or replace function public.consume_auth_rate_limit(p_key_hash text, p_max_attempts integer, p_window_seconds integer)
returns boolean
language plpgsql security definer set search_path = private, public as $$
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
$$;
revoke all on function public.consume_auth_rate_limit(text, integer, integer) from public;
