-- Prevent future postgres-created app tables from inheriting unnecessary maintenance permissions.
alter default privileges for role postgres in schema public revoke truncate,references,trigger on tables from anon,authenticated;

