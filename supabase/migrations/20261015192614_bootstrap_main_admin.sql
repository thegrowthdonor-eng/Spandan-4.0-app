-- Server-only, one-time companion to the initial owner setup route.
-- The route verifies its environment-held setup code before invoking this function.

create function public.bootstrap_main_admin(
  p_auth_user_id uuid,
  p_edition_name text,
  p_starts_on date,
  p_ends_on date,
  p_batch_label text,
  p_course_label text,
  p_full_name text,
  p_roll_canonical text,
  p_phone_e164 text,
  p_fest_id text,
  p_auth_email text
)
returns table (edition_id uuid, batch_id uuid, profile_id uuid)
language plpgsql security definer set search_path = public, private as $$
declare
  created_edition public.editions;
  created_batch public.batches;
begin
  if exists (select 1 from public.editions) or exists (select 1 from public.staff_assignments where revoked_at is null and role = 'main_admin') then
    raise exception 'Initial setup is already complete' using errcode = '42501';
  end if;

  insert into public.editions (name, starts_on, ends_on, status)
  values (p_edition_name, p_starts_on, p_ends_on, 'draft')
  returning * into created_edition;

  insert into public.batches (edition_id, label, course_label, eligible)
  values (created_edition.id, p_batch_label, nullif(btrim(p_course_label), ''), true)
  returning * into created_batch;

  insert into public.profiles (id, full_name, batch_id, roll_canonical, phone_e164, fest_id)
  values (p_auth_user_id, p_full_name, created_batch.id, p_roll_canonical, p_phone_e164, p_fest_id);

  insert into private.auth_identity_map (profile_id, auth_email)
  values (p_auth_user_id, p_auth_email);

  insert into public.access_records (edition_id, profile_id, state, verified_by, verified_at, ledger_reference, reason)
  values (created_edition.id, p_auth_user_id, 'active', p_auth_user_id, now(), 'initial-owner', 'Initial festival owner');

  insert into public.staff_assignments (profile_id, role, granted_by)
  values (p_auth_user_id, 'main_admin', p_auth_user_id);

  insert into public.audit_log (actor_id, action, object_type, object_id, reason, change_summary)
  values (p_auth_user_id, 'festival.initial_setup', 'edition', created_edition.id, 'Initial owner setup', jsonb_build_object('batch_id', created_batch.id));

  return query select created_edition.id, created_batch.id, p_auth_user_id;
end;
$$;

revoke all on function public.bootstrap_main_admin(uuid, text, date, date, text, text, text, text, text, text, text) from public;
revoke execute on function public.bootstrap_main_admin(uuid, text, date, date, text, text, text, text, text, text, text) from anon;
revoke execute on function public.bootstrap_main_admin(uuid, text, date, date, text, text, text, text, text, text, text) from authenticated;
