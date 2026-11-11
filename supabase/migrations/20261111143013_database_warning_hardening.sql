-- Preserve access semantics while reducing repeated row-level auth checks.
set lock_timeout = '5s';
set statement_timeout = '30s';
alter policy "profiles_read_own" on public."profiles" using ((id = (select auth.uid())));
alter policy "access_read_own" on public."access_records" using ((profile_id = (select auth.uid())));
alter policy "applications_read_own" on public."applications" using ((student_id = (select auth.uid())));
alter policy "application_history_read_own" on public."application_history" using ((EXISTS ( SELECT 1
   FROM applications a
  WHERE ((a.id = application_history.application_id) AND (a.student_id = (select auth.uid()))))));
alter policy "help_threads_read_own" on public."help_threads" using ((owner_id = (select auth.uid())));
alter policy "reminders_read_own" on public."reminders" using ((profile_id = (select auth.uid())));
alter policy "feedback_read_own" on public."feedback_responses" using ((profile_id = (select auth.uid())));
alter policy "help_messages_read_own" on public."help_messages" using ((EXISTS ( SELECT 1
   FROM help_threads
  WHERE ((help_threads.id = help_messages.thread_id) AND (help_threads.owner_id = (select auth.uid()))))));
alter policy "groups_visible_to_own_member" on public."participant_groups" using ((EXISTS ( SELECT 1
   FROM (group_memberships gm
     JOIN applications app ON ((app.id = gm.application_id)))
  WHERE ((gm.group_id = participant_groups.id) AND (gm.removed_at IS NULL) AND (app.student_id = (select auth.uid()))))));
alter policy "memberships_visible_to_own_member" on public."group_memberships" using ((EXISTS ( SELECT 1
   FROM applications app
  WHERE ((app.id = group_memberships.application_id) AND (app.student_id = (select auth.uid()))))));
alter policy "poll_votes_read_own" on public."poll_votes" using ((profile_id = (select auth.uid())));
alter policy "push_sub_own" on public."push_subscriptions" using (((select auth.uid()) = profile_id)) with check (((select auth.uid()) = profile_id));

-- One SELECT policy per role, with unchanged published/admin visibility.
alter policy public_merchandise_read on public.merchandise_items to anon;
drop policy admin_merchandise_manage on public.merchandise_items;
create policy authenticated_merchandise_read on public.merchandise_items for select to authenticated using ((((state = ANY (ARRAY['published'::content_state, 'scheduled'::content_state])) AND ((publish_at IS NULL) OR (publish_at <= now())))) or (select public.is_main_admin()));
create policy admin_merchandise_insert on public.merchandise_items for insert to authenticated with check ((select public.is_main_admin()));
create policy admin_merchandise_update on public.merchandise_items for update to authenticated using ((select public.is_main_admin())) with check ((select public.is_main_admin()));
create policy admin_merchandise_delete on public.merchandise_items for delete to authenticated using ((select public.is_main_admin()));

-- One SELECT policy per role, with unchanged published/admin visibility.
alter policy public_sponsors_read on public.sponsors to anon;
drop policy admin_sponsors_manage on public.sponsors;
create policy authenticated_sponsors_read on public.sponsors for select to authenticated using ((((state = ANY (ARRAY['published'::content_state, 'scheduled'::content_state])) AND ((publish_at IS NULL) OR (publish_at <= now())))) or (select public.is_main_admin()));
create policy admin_sponsors_insert on public.sponsors for insert to authenticated with check ((select public.is_main_admin()));
create policy admin_sponsors_update on public.sponsors for update to authenticated using ((select public.is_main_admin())) with check ((select public.is_main_admin()));
create policy admin_sponsors_delete on public.sponsors for delete to authenticated using ((select public.is_main_admin()));

-- Legacy publishers bypass expected-version validation; only the unified endpoint is public API.
revoke execute on function public.publish_result_positions(uuid,jsonb,text,text,text) from public,anon,authenticated;
revoke execute on function public.publish_result_positions_v1(uuid,jsonb,text) from public,anon,authenticated;
-- Profile deletion is called only by the server after API authorization.
revoke execute on function public.delete_student_profile(uuid) from public,anon,authenticated;
grant execute on function public.delete_student_profile(uuid) to service_role;
revoke execute on function public.list_activation_queue() from public,anon;
grant execute on function public.list_activation_queue() to authenticated;

-- Known query/RLS/history lookup paths; leave cold audit-author FKs for measured review.
create index if not exists access_records_profile_id_lookup on public.access_records(profile_id);
create index if not exists application_history_application_id_lookup on public.application_history(application_id);
create index if not exists fixture_history_fixture_id_lookup on public.fixture_history(fixture_id);
create index if not exists fixtures_event_id_lookup on public.fixtures(event_id);
create index if not exists help_threads_owner_id_lookup on public.help_threads(owner_id);
create index if not exists help_messages_thread_id_lookup on public.help_messages(thread_id);
create index if not exists participant_groups_event_id_lookup on public.participant_groups(event_id);
create index if not exists group_memberships_group_id_lookup on public.group_memberships(group_id);
create index if not exists group_memberships_application_id_lookup on public.group_memberships(application_id);
create index if not exists staff_assignments_profile_id_lookup on public.staff_assignments(profile_id);
create index if not exists staff_assignments_event_id_lookup on public.staff_assignments(event_id);
create index if not exists polls_edition_id_lookup on public.polls(edition_id);
create index if not exists poll_votes_profile_id_lookup on public.poll_votes(profile_id);
create index if not exists points_ledger_batch_id_lookup on public.points_ledger(batch_id);
notify pgrst, 'reload schema';

