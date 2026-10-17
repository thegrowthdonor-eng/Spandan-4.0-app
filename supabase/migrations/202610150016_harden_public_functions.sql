-- Explicit role revocation closes the anonymous Data API RPC surface.
revoke execute on function public.apply_to_event(uuid, uuid, jsonb) from anon;

-- Trigger functions should not inherit a caller-controlled search path.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$ begin new.updated_at = now(); return new; end; $$;
