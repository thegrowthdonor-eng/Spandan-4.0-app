# Launch-day admin simplification — 7 November 2026

## Delivered

- Removed duplicate event-operation navigation; retained the management menu and contextual guidance.
- Administration counts unique non-revoked Main Admins, Treasurers and Coordinators.
- Four-step event wizard validates forward navigation, saves only from Review, uses numbered choice inputs, and hides capacity/waitlist and extra schedule controls without resetting existing values.
- Optional poster selection works before a draft exists: local metadata-stripped WebP, aspect ratio preserved, maximum 1600px, 150–300 KB target / 500 KB upload cap. Existing podium/gallery compression is unchanged.
- Failed poster upload retains the file and draft ID; retry cannot create a second event. Failed attachment cleans the new object and preserves the old poster.
- Shared category labels: Sports, Cultural, Literary, Arts, Gaming & Specials; stored enum keys unchanged.
- Informational events have no registration or competitive operations. Database guards enforce this independently of the UI; type changes require an empty draft.
- Sports squads use explicit batch-first captain appointments and same-batch rosters, including historical sports configurations. Pair and cultural/literary group settings remain unchanged.

## Verification

- 58 unit tests passed; TypeScript passed; ESLint has zero errors and two pre-existing warnings (maintenance navigation, merchandise image).
- QA and production builds passed.
- Isolated QA reset and full verification passed, including management role boundaries, team/pair consent, exclusivity/concurrency, informational-event denial and legacy batch-scope enforcement.
- Browser tests passed: 56 management-route checks at 360/390/768/1440px; team/pair flows; launch wizard, numbered choices, poster retention, real Storage attachment and simulated upload failure/retry. No overflow or client runtime errors in checked views.
- Found and fixed a browser default-action edge case: changing Continue into a submit button during its click caused an unintended save. Continue now advances through the form submit handler; browser regression asserts no event-save request before explicit Review save.
- QA builds use `.next-qa`, guarded isolated environment values, and browser preflight checks before login/writes. This prevents collision with a developer's production-configured `.next` output.

## Database rollout

Applied QA first, then the same migration files to original production:

1. `20261107105714_launch_day_admin_simplification.sql`
2. `20261107112556_enforce_legacy_sports_batch_scope.sql`

Eight changed function-definition hashes match between QA and production. Anonymous event reads pass; anonymous editor/poster RPC access is denied. Read-only production Main Admin context lists all 35 events.

Production counts stayed unchanged: 35 events, 20 profiles, one application, zero groups/results/pair invitations. All 35 existing events retain registration enabled. No QA identities or assets were copied. No programme events were invented and maintenance mode was not changed.

## Remaining limits

Physical Android/iPhone picker and date-control behaviour was not tested. A representative text poster compressed from 580.9 KB to 128.6 KB; dense real posters still need organiser preview and may require cropping. Size targets are not guarantees.

Existing Supabase advisory classes remain: intentional role-checked security-definer RPC exposure, RLS-enabled internal tables without API policies, and disabled leaked-password protection. This release does not claim to resolve those unrelated settings. [Password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
