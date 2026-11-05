-- New Supabase projects do not expose public-schema tables through the Data API
-- automatically. These are read-only grants; existing RLS policies still apply.
grant usage on schema public to anon, authenticated;

grant select on table
  public.editions, public.batches, public.events, public.fixtures,
  public.score_snapshots, public.result_publications, public.result_positions,
  public.points_ledger, public.notices, public.polls, public.poll_options,
  public.content_banners, public.sponsors, public.media_items,
  public.stage_reveals, public.organiser_profiles, public.merchandise_items,
  public.published_batch_standings, public.published_batch_standing_board
to anon, authenticated;

-- Signed-in views used by My Fest and organiser screens. RLS limits every row.
grant select on table
  public.profiles, public.access_records, public.applications,
  public.application_history, public.participant_groups,
  public.group_memberships, public.reminders, public.poll_votes,
  public.feedback_responses, public.help_threads, public.help_messages,
  public.staff_assignments, public.point_rules
to authenticated;
