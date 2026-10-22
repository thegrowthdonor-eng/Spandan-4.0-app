**SPANDAN 4.0 — multi-role operational audit**
  
Audit date: 22 October 2026 (user timezone: Asia/Calcutta).

**Verdict: not ready for unrestricted festival use.** The main blocker is a confirmed authorization bypass, followed by broken fixtures/export and several inconsistent participant lifecycle transitions.

**What was actually exercised**

Production build on localhost:3000 against the configured Supabase project. This was a hybrid browser, HTTP API, authenticated database/RLS and source audit—not a claim that every button on every device passed.

- 104 mobile-browser route visits: guest (20), participant, pending identity, treasurer, event head, event coordinator, notice publisher and main admin (12 each).
- Actual mobile clicks: Apply → organiser Approve → Select → participant My Fest. Passed after dismissing the install banner that intercepted Approve.
- 105 assertions across three rollback SQL suites. These used synthetic identities, actual authenticated/anon database roles, actual permissions and actual business RPCs. The raw output contains 64 matching assertions and 41 mismatches. These are not 41 distinct bugs: many repeat the same permission bypass across roles, and some are error-code/expectation differences.
- Real HTTP signup, blocked pending login, activation, exact-roll login, recovery issuance/redemption/replay, password change, suspension, senior invitation/redemption/replay and PG/JR/Faculty phone login.
- Team composition, captain checks, single/bulk review and selection, capacity/waitlist, gender, required questions, score version conflicts, rescheduling, reminders, polls, feedback, support replies, notices and result correction were exercised through actual database operations.
- CSV export and image upload exercised over HTTP. Previously cached public catalogue loaded offline.
- Existing unit tests: 24/24 passed. TypeScript and production build passed. Baseline lint failed: 29 errors, 5 warnings.
- Database mutations in SQL suites rolled back. Committed browser/API test records were removed. Final database checks: zero AUDIT editions, profiles, matching test auth users and audit-temp uploaded objects. No actual participant record was intentionally modified, and no notice/push broadcast was sent.

Browser role sessions were provisioned with Supabase Auth and SSR cookies to isolate role permissions. The pending-session test deliberately bypassed the app login screen using a valid provider session, to test whether backend authorization survives that situation. Signup/login gates were tested separately via the real HTTP endpoints.

**Role coverage and practical outcome**

| Role | Operations exercised | Outcome |
|---|---|---|
| Guest | Public catalogue, schedule, live, standings, notices, sponsors, gallery, merchandise, committee, FAQs, account, recovery, invite, protected redirects, offline | Public pages loaded; protected pages redirected to account. Merchandise/committee currently show coming-soon content. |
| UG participant | Signup, pending/active login, Apply UI, duplicate application, My Fest, withdrawal, recovery, suspension, upload denial | Normal apply-to-selection works; serious permission, withdrawal, roll-format and upload failures. |
| PG / JR / Faculty | Invitation issue/redeem/replay, phone login, profile provision | All three login paths succeeded. Gender remains null. Deletion fails on private senior references. A hydrated Faculty pass was verified separately. |
| Treasurer | Activation with/without ledger, suspension, activation queue, support assign/resolve | Legitimate operations worked, but role can also pass admin and unrelated-event checks. |
| Event Head | Assigned-event review/select, groups, fixtures, score/result RPCs, export | Happy paths partly work; isolation fails; fixtures screen and export are broken. |
| Event Coordinator | Hub/editor and proposal creation | Proposal created open instead of draft because caller is incorrectly treated as main admin. |
| Notice Publisher | Hub/notices, notice publication and invalid expiry in rollback | Publishing and expiry validation worked; unrelated admin permissions incorrectly granted. |
| Main Admin | All organiser screens, activation, invitations, recovery, events, results and corrections | Many operations work, but fixtures, export, lifecycle controls and senior deletion block important work. |

**P0 — release blockers**

**F01. Any authenticated identity passes core organiser permission checks. Confirmed in database, browser and HTTP.**

Repro: use a participant with no staff assignment. is_main_admin(), can_manage_access(), can_manage_event(an unrelated UUID), can_publish_notices() and can_create_events() all return true. Browser shows “Main Administrator”, Activation Queue and Control Centre. Participant can approve their own application; admin results GET also returns 200.

Cause: SECURITY DEFINER functions owned by postgres test current_user in ('service_role', 'postgres'). Inside these functions current_user is the owner, not the caller. The deployed can_create_events() also has this bypass, although that exact change is absent from the local coordinator migration—there is database/source drift.

Location: supabase/migrations/20261021214000_enable_service_role_for_admin_rpcs.sql:8 and the following permission functions; deployed definitions are retained in audit-db-functions.sql.

Impact: account activation, unrelated-event management, sensitive organiser data and other operations guarded by these helpers lose their intended role boundaries. This does not mean every RPC is exposed: recovery issuance and senior invite management independently check staff assignments and rejected unauthorized callers.

Fix direction: remove the definer-owner shortcut; validate trusted request claims where a service-only path is needed, and resolve user roles from current, non-revoked assignments. Retest all negative permissions using authenticated JWTs and RLS, not a service client.

**F02. Tracked source contains current server credentials. Confirmed.**

scripts/e2e-audit.ts:7–8 embeds a Supabase server key and identity pepper. Both exactly matched the current local environment. Values are intentionally omitted here.

Impact: anyone with that source can obtain privileged credentials. This is independent of F01.

Fix direction: revoke/rotate the server key and update deployments; remove secrets from tracked source and audit repository history/access. Pepper changes need an identity migration plan because login email derivation depends on it—blindly changing it can lock out existing accounts. The old audit script also contains cleanup against an ordinary batch/roll; do not run it as a safe regression suite.

**P1 — high-impact operational defects**

**F03. Suspension does not close existing organiser access. Confirmed HTTP/browser.**

An activated UG user was suspended successfully. Its existing session still received the Operations Hub at /admin. A fresh login was blocked. Admin pages generally test auth.getUser(), then role helpers; they do not consistently enforce active festival access. Fix F01 and separately enforce active access/revocation for protected operations. Location: src/app/admin/page.tsx; src/server/auth/access.ts exists but is not consistently used.

**F04. Image upload has no organiser-role check. Confirmed HTTP.**

A participant uploaded a valid tiny PNG to /api/admin/upload and received 200. Only auth.getUser() is checked before the service client uploads to fest-media. This remains a bug even after F01 is fixed. Require explicit upload permission and appropriate event scope. Location: src/app/api/admin/upload/route.ts:27.

**F05. Fixtures screen cannot load. Confirmed for all seven authenticated browser identities.**

/admin/fixtures displays “Fixtures are temporarily unavailable.” list_event_fixtures fails with SQLSTATE 42702: column reference "score_payload" is ambiguous. The unqualified inner SELECT conflicts with RETURNS TABLE output variables; qualify every snapshot column, including fixture_id. Location: supabase/migrations/20261016000005_fixtures_and_results.sql:39.

Impact: creation/scoring/reschedule controls are not rendered because the whole workspace depends on the failing list RPC.

**F06. Participant CSV export always errors on its audit insert. Confirmed HTTP and SQL.**

Export of the synthetic selected participant returned 500. export_event_participants is declared STABLE but performs INSERT into audit_log; PostgreSQL rejects this with 0A000, “INSERT is not allowed in a non-volatile function”. Location: supabase/migrations/20261016000001_complete_event_editor.sql:170.

Fix volatility or move audited export into a suitable function/transaction, then verify CSV content and escaping.

**F07. Public live-score visibility and event lifecycle disagree. Confirmed with anon RLS and RPCs.**

Both ongoing and completed event-state commands are accepted by the TypeScript schema but rejected by set_admin_event_state. Public score_snapshots policy allows rows only when the parent event is ongoing/completed. A score for an open event was invisible to anon; changing the parent to ongoing inside the rollback test made it visible.

Location: supabase/migrations/20261021163000_event_coordinators_and_proposal_flow.sql:274; score_snapshots_public_read policy; src/app/live/page.tsx.

Impact: saving a live score is insufficient to make it appear publicly, and the supported lifecycle RPC cannot enter the required state. Score snapshots also leave fixture.state unchanged, and a newly timed fixture stays draft until a reschedule.

**F08. Approved, unselected participant cannot withdraw. Confirmed.**

Submission withdrawal works. After approval, withdrawal fails with 23514 applications_check because withdraw_application changes review_state to withdrawn but retains reviewed_at. The constraint requires reviewed_at to be null outside approved/rejected/waitlisted.

Location: supabase/migrations/20261021095128_simplify_event_registration_and_access.sql:313. Preserve the review audit in history while making the current-row state consistent.

**F09. Withdrawal/reapplication is a dead end. Confirmed.**

Apply → withdraw → apply again returns the same withdrawn row, not a new submission. Staff review also refuses withdrawn applications. UI text suggests reopening applications can restore this, but changing the window does not reset the existing row.

Location: same migration:283–288; src/app/events/apply-button.tsx. Decide whether reapplication is allowed and implement an explicit transition or clearly state the permanent restriction.

**F10. Review can leave “rejected + selected”. Confirmed.**

Approve → select → reject preserves selection_state=selected. This can create contradictory rosters/reminders and prevents the participant withdrawing through the selected restriction.

Location: review_application and bulk_review_applications. Either reject an incompatible transition or atomically update selection/group membership with an audit reason.

**F11. Bulk solo selection bypasses team rules. Confirmed.**

Single select_solo_application correctly refuses a sport application. bulk_solo_selection accepts that same application without publishing a squad. It can also mark a published squad member not_selected while the membership remains published.

Location: supabase/migrations/20261016000004_review_workspace_and_bulk.sql, bulk_solo_selection. Apply the same event-format and state rules in single and bulk commands.

**F12. Changing the global window silently opens draft/closed events. Confirmed.**

A draft event became open after set_global_registration_window. The UPDATE preserves only cancelled/completed; draft, closed and ongoing all become open. This is independent of the coordinator permission bypass.

Location: supabase/migrations/20261021095128_simplify_event_registration_and_access.sql:139. Date changes should preserve event lifecycle unless an explicit transition is requested.

**F13. Senior accounts cannot be removed by the existing deletion routine. Confirmed during cleanup.**

delete_student_profile fails on senior_invites_profile_id_fkey; deleting the issuing admin can fail on senior_invites_issued_by_fkey. senior_login also references the profile without cascade. The routine does not handle these private tables.

Location: supabase/migrations/20261021175000_protect_admin_profiles.sql:132; private.senior_invites and private.senior_login. Define retention/audit behavior, clear or preserve references deliberately, then delete. Cleanup required explicitly removing only our test references.

**F14. Null gender bypasses gender-specific eligibility. Confirmed.**

The PG/JR/Faculty provisioning flow leaves gender null. apply_to_event only rejects mismatch when applicant_gender is not null. A null-gender synthetic profile successfully applied to a girls-only event.

Location: complete_senior_invite; apply_to_event in 20261021095128 migration:275. Capture required eligibility data for seniors or explicitly enforce a documented exemption.

**P2 — workflow, validation and usability defects**

**F15. Roll-number equivalence differs between signup and login. Confirmed HTTP.**

Signup accepts 089 and reserves numeric roll 89, but login with 89 returns 401 while 089 works. Signup duplicate detection uses numeric extraction; identity hashing retains textual formatting. Use one canonical identity rule or resolve the registered identity through a server lookup. Locations: src/app/api/auth/signup/route.ts; src/server/auth/identity.ts:15.

**F16. Support, polls and reminders are not connected to the participant UI. Source-confirmed gap.**

HelpDesk and PollWidget are defined but never mounted. My Fest does not load help threads/messages or reminders. Staff help UI shows subject/count/actions, but no message body/conversation, so staff cannot read the initial detail before responding. The DB support and poll operations themselves passed.

Locations: src/app/my-fest/support-tools.tsx; poll-widget.tsx; my-fest/page.tsx; src/app/admin/help/help-staff-client.tsx. Build the complete create → staff read/reply → participant read/reply flow, mount polls, and expose reminders. Reschedule does not call reminder generation automatically despite copy promising automatic reminders.

**F17. Scores accept arbitrary/invalid payloads. Confirmed RPC and source.**

A payload with negative goals and nonsensical wickets was saved. write_score_snapshot only checks JSON is an object. The HTTP schema likewise accepts an arbitrary record; validateScore is only referenced by its own unit tests.

Location: src/app/api/admin/fixtures/route.ts; src/server/competition/scores.ts; write_score_snapshot. Validate against the event template at the actual write boundary. The stale-version conflict check correctly rejected a concurrent-version mismatch.

**F18. Reporting time may be after match start. Confirmed.**

reschedule_fixture accepted reporting at +3 days and start at +2 days. Add chronological validation in both API and database. Fixtures currently use free-text participant labels, so participant-level overlap detection is also absent; consider stable team/participant references for operational scheduling.

**F19. Select-question options are not validated. Confirmed.**

Required questions reject empty answers, but a required select configured with A/B accepted NOT_AN_OPTION. Validate option membership, not just non-empty text.

**F20. Install banner obstructs mobile operation controls. Confirmed Playwright interaction.**

At 390×844, the visible Approve button could not be clicked for 30 seconds because .pwa-install-banner intercepted pointer events. Dismissing the banner allowed the actual flow to pass. Evidence: interaction-first-attempt.json. Reserve space, avoid covering critical controls, and persist dismissal appropriately.

**F21. JSON null crashes fixture POST. Confirmed HTTP.**

Unauthenticated POST /api/admin/fixtures with JSON null returned 500 because body.action is read before validating the object. Location: src/app/api/admin/fixtures/route.ts:86. Return a structured 400 and validate before accessing fields.

**F22. Suspended/rejected login displays “awaiting Treasurer verification”. Confirmed for suspended login.**

The denial is correct, but the message sends a suspended user down the wrong support path. Return appropriate status guidance without revealing other accounts’ existence. Location: src/app/api/auth/login/route.ts.

**F23. Shared-campus-IP throttling needs an operational decision. Partly observed, partly source inference.**

Senior invite redemption reached HTTP 429 on the sixth attempt from the same test IP, even though it targeted a different token. Signup allows five attempts per IP per 15 minutes; login allows ten. On shared college Wi-Fi this can block multiple legitimate people. No load test was performed; the shared-IP risk follows directly from the counters. Preserve abuse protections while accommodating the expected registration-desk/campus traffic.

**F24. Baseline quality gate is red. Confirmed.**

Lint returned 29 errors and 5 warnings before new audit scripts were created. Issues include existing require-style scripts, a no-explicit-any in the old audit script, React effect-state rules and unused variables. Build and typecheck success do not imply functional/security readiness.

**What passed and should remain protected by regression tests**

- Pending login/application gate; active signup/activation with ledger validation.
- Exact-identity password login; recovery issue restricted to actual main admin; single-use recovery token; new password works and old password fails.
- PG/JR/Faculty invite redemption and phone login. Two replay tests reached the single-use rejection; the third was stopped earlier by rate limiting, so its token branch was not independently exercised.
- Duplicate event applications return the existing row.
- Capacity-full rejection and waitlist creation.
- Non-null gender mismatch rejection and required-question checks.
- Valid event-head review/selection; selected participant withdrawal refusal.
- Squad minimum/captain membership checks and no silent additions after publication.
- Score optimistic-concurrency rejection and mandatory reschedule reason.
- Result publication/correction with reason; only current publication contributes to the verified point total. Duplicate winner rejected by database uniqueness (different error code than the harness expected).
- Poll duplicate-vote protection; active feedback; support assign/resolve/message ownership; notice expiry check.
- Anonymous protected routes redirect; public mobile pages had no observed JS page errors or horizontal overflow in the route sweep.
- Cached catalogue loads offline. This is not a full PWA/device-install certification.

**Recommended repair order**

1. Contain credential exposure and repair role helpers, upload authorization and suspension/session enforcement.
2. Repair fixture listing, CSV export and coherent event/fixture/score lifecycle.
3. Repair withdrawal/reapply/review/team invariants; preserve drafts when changing windows.
4. Repair senior eligibility/deletion and roll identity consistency.
5. Connect support, polls and reminders; fix mobile obstruction and validation/error handling.
6. Add these negative-role and lifecycle cases to automated regression tests; rerun the full operational journey after fixes.

**Coverage limits and interpretation**

No live notice/push delivery, real-device Android/iOS install behavior, full offline private-state isolation, load/concurrency stress, production-domain TLS/cookies, real payment reconciliation, disaster recovery, or every browser engine was validated. “Concurrency” here means score version-conflict behavior, not simultaneous load testing. Event/group/result operations were often database-level tests, not clicks through every editor.

The early senior browser assertions read before the rendered pass was ready; they are not treated as confirmed bugs. A follow-up hydrated Faculty pass succeeded. The raw suite’s fixture-state expectation uses the word live, while the enum uses ongoing; the observed draft/no transition is the relevant finding. The duplicate-result mismatch is an error-mapping issue, not duplicate-winner acceptance.

Some function definitions in the live database differ from the repository. Repair and migration planning must reconcile deployed definitions as well as local SQL files.

Only audit artifacts/scripts were added. No application fixes or schema migrations were applied.

