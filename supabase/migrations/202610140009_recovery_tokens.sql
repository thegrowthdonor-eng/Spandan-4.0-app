-- Authorised, one-use recovery. The raw token is generated and shown only by the server route.
create table private.recovery_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  issued_by uuid not null references public.profiles(id),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  expires_at timestamptz not null,
  attempts integer not null default 0 check (attempts >= 0 and attempts <= 5),
  used_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (not (used_at is not null and invalidated_at is not null))
);
create index recovery_tokens_active_profile on private.recovery_tokens(profile_id) where used_at is null and invalidated_at is null;
revoke all on table private.recovery_tokens from anon, authenticated;

create or replace function public.issue_recovery_token(p_profile_id uuid, p_token_hash text, p_reason text)
returns timestamptz
language plpgsql security definer set search_path = public, private as $$
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
$$;
revoke all on function public.issue_recovery_token(uuid, text, text) from public;
grant execute on function public.issue_recovery_token(uuid, text, text) to authenticated;

-- This server-only RPC atomically consumes the token before the provider password update.
-- A provider failure is safe but requires an authorised admin to issue a fresh token.
create or replace function public.consume_recovery_token(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = public, private as $$
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
$$;
revoke all on function public.consume_recovery_token(text) from public;
