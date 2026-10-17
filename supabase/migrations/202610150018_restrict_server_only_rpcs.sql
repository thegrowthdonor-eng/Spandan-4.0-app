-- These RPCs are invoked only with the server-only Supabase secret. Allowing
-- authenticated browser sessions to call them would let a user provision
-- arbitrary profiles, consume recovery tokens, or interfere with rate limits.
revoke execute on function public.consume_auth_rate_limit(text, integer, integer) from authenticated;
revoke execute on function public.provision_student_profile(uuid, uuid, uuid, text, text, text, text, text) from authenticated;
revoke execute on function public.consume_recovery_token(text) from authenticated;
