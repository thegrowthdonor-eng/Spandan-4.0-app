-- RLS does not protect TRUNCATE. API roles never need table maintenance privileges.
set lock_timeout = '5s';
do $migration$
declare t record;
begin
  for t in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p')
  loop
    execute format('revoke truncate, references, trigger on table %I.%I from public,anon,authenticated',t.nspname,t.relname);
    if t.nspname='public' and t.relname in ('merchandise_items','sponsors','push_subscriptions') then
      execute format('revoke insert,update,delete on table %I.%I from public,anon',t.nspname,t.relname);
    else
      execute format('revoke insert,update,delete on table %I.%I from public,anon,authenticated',t.nspname,t.relname);
    end if;
  end loop;
end $migration$;
notify pgrst, 'reload schema';

