-- Atomic profile-side companion to a server-created Supabase Auth user.
-- The API deletes the just-created Auth user if this transaction fails.
create or replace function public.provision_student_profile(
  p_auth_user_id uuid,
  p_edition_id uuid,
  p_batch_id uuid,
  p_full_name text,
  p_roll_canonical text,
  p_phone_e164 text,
  p_fest_id text,
  p_auth_phone_e164 text
)
returns public.profiles
language plpgsql security definer set search_path = public, private as $$
declare
  profile public.profiles;
begin
  if not exists (select 1 from public.batches where id = p_batch_id and edition_id = p_edition_id and eligible) then raise exception 'Invalid eligible batch' using errcode = '22023'; end if;
  insert into public.profiles (id, full_name, batch_id, roll_canonical, phone_e164, fest_id)
  values (p_auth_user_id, p_full_name, p_batch_id, p_roll_canonical, p_phone_e164, p_fest_id)
  returning * into profile;
  insert into private.auth_identity_map (profile_id, auth_phone_e164) values (p_auth_user_id, p_auth_phone_e164);
  insert into public.access_records (edition_id, profile_id, state) values (p_edition_id, p_auth_user_id, 'pending');
  insert into public.audit_log (actor_id, action, object_type, object_id, change_summary) values (p_auth_user_id, 'profile.created', 'profile', p_auth_user_id, jsonb_build_object('source', 'signup'));
  return profile;
end;
$$;
revoke all on function public.provision_student_profile(uuid, uuid, uuid, text, text, text, text, text) from public;
