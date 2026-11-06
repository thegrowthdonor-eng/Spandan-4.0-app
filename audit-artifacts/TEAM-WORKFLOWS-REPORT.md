# Captain-led teams and mutually confirmed pairs

## Behaviour

- Solo events route to participant selection; no captain or team composer.
- Pair events use exact batch/roll lookup, limited identity confirmation, invitation, recipient acceptance and coordinator publication. Required event answers create the accepting student's application atomically; existing registrations are reused.
- Pending invitations reserve nobody. Event-row locking and the existing active-membership uniqueness constraint ensure concurrent acceptance produces only one confirmed pair. Acceptance closes conflicting pending invitations.
- Team/group staff appoint an approved, active event participant. Only that appointed captain/group leader can choose the initial name and roster. Staff can edit an existing proposal, return it with instructions and publish it.
- Proposals do not insert active membership rows. Publication validates event, approved/active applicants, division, batch, roster limits, leader membership and exclusivity transactionally.
- Published team edits require a reason; removed/new members' selection states and application histories are updated. Published pair changes release both members with a reason and require fresh mutual invitations. Existing result snapshots are not rewritten.
- My Fest and event details expose the participant workspace. Admin navigation, fixtures and results guidance use the event format. Pair setup is always exactly two partners.
- New private invitation data uses RLS. Workflow RPCs deny PUBLIC/anon and verify the caller internally. Captains receive only approved applicants' names/rolls/batches, never phone numbers or application answers. Exact partner lookup is rate limited.
- Old direct create/add/publish group RPCs are no longer executable by authenticated users, so they cannot bypass the new workflow. The old HTTP URL accepts only the new validated workflow contract.

## Migration chain

Apply these shared migrations in order; QA and production must use the same files:

1. `20261106193319_participant_team_and_pair_workflows.sql`
2. `20261106194347_guard_team_and_pair_transitions.sql`
3. `20261106194751_team_conflicts_and_pair_size_guards.sql`
4. `20261106194851_fix_team_publication_member_validation.sql`

QA iteration caught a PostgREST retry problem with using SQLSTATE 40001 for a stale form (now business conflict 55000), and a PL/pgSQL record/alias ambiguity in publication (fixed before production rollout).

## Verification

- `npm test`: 54 passing tests.
- Typecheck passed.
- ESLint: zero errors; two existing warnings in maintenance navigation and merchandise image handling.
- QA and production builds passed.
- `qa:reset` and `qa:verify` passed on isolated project `rgcevrvxfunmwephhomy`.
- `verify-team-workflows.ts` tests captain-only initial proposal, coordinator corrections, staff/editor/unrelated-user denials, draft privacy, stale versions, submission/review/publication, group leader appointment, required registration answers, transactional rollback, concurrent pair acceptance, exclusivity, fresh consent after correction, withdrawal protection, roster lock and anonymous denial.
- `verify-team-ui.ts` completed captain appointment → captain name/member selection → coordinator approval and partner lookup → invite → recipient auto-registration/acceptance. It checks solo redirects, pair-only tools, 360/390/1440px overflow, anonymous API rejection, cross-origin rejection and legacy command denial.
- Existing management browser regression passed all 56 responsive route checks, accessible dialogs, event draft creation/publication and role navigation.
- QA security advisors reviewed: no new anonymous-definer exposure. New authenticated definer endpoints intentionally retain internal authorization checks. Existing advisor findings are outside this feature.

## Re-running browser checks

Use `.env.qa.local`, the existing external Playwright installation via `PLAYWRIGHT_MODULE`, and optional `QA_CHROMIUM_PATH`. Point `QA_BROWSER_URL` at a local server built with QA configuration. The script guards against non-QA Supabase configuration and non-local browser URLs. Temporary probes are removed by exact IDs. Screenshots are local, untracked audit assets.

## Rollout status / limits

- All four migrations applied to QA and original production project `uytvtmkapusjjqhjyopd` after explicit rollout approval. Workflow function-definition hashes and execution grants match across both databases. Production anonymous RPC calls return 401/42501; the existing production Main Admin passes the read-only pair workspace permission check. No QA identities, invitations or results were copied.
- Production data before rollout: 35 events, 20 profiles, 1 application, 0 groups, 0 result publications. GitHub/Vercel deployment completion is checked separately in the delivery response.
- Maintenance mode is unchanged. Staff actions use the existing maintenance-allowed admin endpoint; student access remains subject to the site's existing maintenance policy.
- No new dependencies, staff roles, chat, email or push-notification service were added.
- Physical Android/iPhone, unreliable campus networks and festival-scale load were not tested. Identity and playing ability still require organiser verification. Teams/groups deliberately do not ask each member to accept; only pairs require mutual consent.
