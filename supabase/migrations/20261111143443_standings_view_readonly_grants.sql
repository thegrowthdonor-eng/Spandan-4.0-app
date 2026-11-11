-- Public standings views need SELECT only; preserve their existing read grants.
revoke insert,update,delete,truncate,references,trigger on public.published_batch_standings,public.published_batch_standing_board from public,anon,authenticated;

