-- Only the atomic start-and-claim RPC is callable by end-user sessions.
revoke execute on function public.start_fixture(uuid) from authenticated;
