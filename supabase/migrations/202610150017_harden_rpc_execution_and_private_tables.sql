-- Public RPCs execute with elevated database privileges, so anonymous callers
-- must never retain PostgreSQL's default EXECUTE grant.
do $$
declare
  function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from anon', function_record.signature);
  end loop;
end
$$;

-- These schemas are already non-public and have direct privileges revoked.
-- RLS adds defense in depth without adding browser-access policies.
alter table private.auth_rate_limits enable row level security;
alter table private.recovery_tokens enable row level security;
