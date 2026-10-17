-- Only batches that have already appeared in a published result become readable publicly.
-- This permits the invoker-secured standings view to display a useful leaderboard
-- without opening the complete batch directory.
create policy batches_read_when_in_published_standings
on public.batches
for select
using (
  exists (
    select 1
    from public.points_ledger ledger
    join public.result_publications publication on publication.id = ledger.publication_id
    where ledger.batch_id = batches.id
      and publication.state = 'published'
  )
);

create or replace view public.published_batch_standing_board
with (security_invoker = true) as
  select
    standings.batch_id,
    batches.label,
    batches.course_label,
    standings.points
  from public.published_batch_standings standings
  join public.batches on batches.id = standings.batch_id;

grant select on public.published_batch_standing_board to anon, authenticated;
