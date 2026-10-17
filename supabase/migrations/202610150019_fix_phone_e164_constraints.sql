-- PostgreSQL standard string literals preserve backslashes. Use an escape
-- string so the regular expression matches a literal leading plus sign.
alter table public.profiles drop constraint profiles_phone_e164_check;
alter table public.profiles add constraint profiles_phone_e164_check
  check (phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$');

alter table private.auth_identity_map drop constraint auth_identity_map_auth_phone_e164_check;
alter table private.auth_identity_map add constraint auth_identity_map_auth_phone_e164_check
  check (auth_phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$');
