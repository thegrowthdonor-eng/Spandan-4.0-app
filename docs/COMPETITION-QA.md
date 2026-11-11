# Competition delivery: observed QA and remaining gates

## Latest revision: simplified operations and student schedule

The implementation now follows [SIMPLIFIED-OPERATIONS.md](SIMPLIFIED-OPERATIONS.md). Earlier heat/session checks below describe the preceding revision, not currently exposed functionality.

- **76 unit tests passed**, typecheck and optimised QA/normal production builds passed. Lint has zero errors and the same eight existing warnings.
- Updated rollback-wrapped SQL suites passed for manual values without sessions, public value projection, preserved correction identity/history, stale-write rejection, stage-result prohibition, chess fixtures without scoring, atomic start failure, image requirements and text-only entry approval. Existing six-template fixture tests and voting security/window/counter/disqualification tests passed.
- Full real API/Chromium suite passed: atomic event/method creation, manual results and correction review, blank winner defaults, all simplified event workspaces, direct scorer restrictions (including navigating away from an already-open match), future-date lock, one-action Start, offline checkpoint/reconnect, lawn-tennis games/sets and table-tennis points/sets, direct text-entry voting, runoffs and official points.
- Mobile schedule date changes, browser Back, search URL persistence/reload and desktop/mobile overflow checks passed. Screenshots of schedule/results were inspected; a mobile rank-ordering layout defect found during inspection was corrected and reverified.
- Dedicated `qa:schedule` checks passed with scoped fictional programme records: chronological order across categories, separate unknown timings, missing-venue fallback, Scheduled/Live/Finished/Cancelled states, all programme category filters and empty search. Filter/search controls produced no schedule RSC requests. The programme rows and their live-state children were removed afterwards.
- Real written submissions were submitted/approved through the API, without mocked media or R2. Image security tests still use rollback-only mock registry records, not a real R2 provider.
- Latest bounded voting p95 at concurrency **1 / 4 / 8**: retries **60 / 110 / 143 ms**; fresh ballots **66 / 67 / 90 ms**. No unexpected errors or counter mismatches. These tiny observations are not an audience-capacity guarantee.
- Local clock observation and hidden notification polling checks passed again. Supabase advisor review found no missing FK indexes for the new competition/media work; restricted RPC/definer notices and pre-existing findings remain as described below.
- Post-cleanup QA database snapshot: **19,912,371 bytes**, zero temporary competition/configuration event rows. Historical audit data was retained.

Production was inspected read-only to prepare the two-event mapping; no production mutation, push or deployment occurred. R2 delivery/migration, actual monthly quota headroom, real CDN behavior and physical-device testing remain unverified. No deliberate provider outage was injected; partial-source failure behavior was inspected in code.

---

Verified 11 November 2026 on `feature/competition-voting-r2`. Only isolated Supabase QA (`rgcevrvxfunmwephhomy`) was mutated. Production database, deployments, media references and original objects were untouched.

## Passing checks

- 73 unit tests; TypeScript typecheck; normal production build and isolated production-mode QA build.
- ESLint: zero errors, eight existing warnings (production-cleanup unused variable, existing merchandise/sponsor images, maintenance navigation, my-fest unused variable).
- Rollback-wrapped SQL suites: `competition_operations.sql`, `competition_voting.sql`, and existing `fixture_start.sql`. These cover permissions/cross-event ownership, version checks, measurement/ranking, previous/new correction values, all six existing score templates, cricket reconciliation, voting windows/expiry/revocation, immutable retries, hidden totals, counter reconciliation, disqualification, zero votes and runoff eligibility.
- Real API integration: heat/time, flight/distance, common-session/count, running-order/faculty places, information-only status; official results/points; explicit Start, repeat Start and device conflict; frozen award rules and complete-group runoff.
- Headless Chromium at 390×844 and desktop: event-family navigation without horizontal overflow, direct public vote, approved-entry identity selector, future-date bookmark without scoring controls, one-action Start & Score, offline checkpoint/reconnect sync and no browser runtime errors. Enter-key measurement correction saves the current input, and authorised history displays the previous mark.
- Network checks: actual vote was one authenticated app bootstrap followed by one direct Supabase RPC; local scorer clock visibly advanced with zero API requests during the 2.2-second observation; simulated hidden bell made no requests over 301 seconds, then refreshed once on visibility with no cookies. API Live Ground response included non-match sessions, public caching headers and no Set-Cookie. Unit checks also cover hidden polling and shared request deduplication.
- Fresh screenshots `scratch/competition-mobile.png` and `scratch/voting-mobile.png` were generated; mobile workspace visually inspected. Screenshots are ignored local artifacts, not production data.

## Bounded voting concurrency observations

Latest complete local-client → remote-QA run; tiny samples, not a throughput guarantee. Each stage stops on unexpected failure. Authentication/capability provisioning is outside the measured vote-RPC interval. Distinct voters are existing fictional active QA accounts; the counter is intentionally a shared-option hotspot.

| Concurrency / requests | Retry p95 | New ballot p95 | Unexpected errors |
|---|---|---|---|
| 1 / 1 | 67 ms | 50 ms | 0 |
| 4 / 4 | 161 ms | 112 ms | 0 |
| 8 / 8 | 132 ms | 108 ms | 0 |

All retries returned the original receipt and counted once. Thirteen fresh voters inserted thirteen ballots with exact counters. End-to-end runoff verification and official points publication passed. Expected invalid-verification/incomplete-runoff requests were rejected and are not unexpected errors.

After cleanup: zero temporary `qa-competition-*` events remained. QA database size was **19,805,875 bytes**; competition/media tables including indexes used **696,320 bytes**. Audit records were intentionally retained. These are snapshots, not per-user growth estimates or monthly quota measurements.

## Security and dependency review

Supabase security/Postgres skills guided database-boundary validation, restricted grants/RLS, lock ordering and foreign-key indexes. Final QA advisors show no missing FK indexes for the new competition/media tables. New RLS-without-policy notices are intentional: direct end-user table privileges are revoked and narrow permission-checked RPCs are the access path. Public definer notices are intentional for sanitised reads and the capability-validated ballot endpoint; authenticated mutation/history functions recheck event authority. Unused new indexes are retained for FK/deletion and future real traffic rather than removed on a tiny QA sample.

Existing unrelated advisor findings remain, including leaked-password protection, old unindexed FKs and old RLS init-plan warnings. No paid Auth setting was activated. See [Supabase advisor guidance](https://supabase.com/docs/guides/database/database-linter) and [password security](https://supabase.com/docs/guides/auth/password-security).

`npm audit --omit=dev` found zero production vulnerabilities during this delivery. The full dependency audit reported seven moderate existing development lint/minimatch-chain advisories; no unrelated toolchain upgrade was attempted.

## Explicitly not verified / not complete

- **Real R2 upload-to-vote workflow and media migration:** account/buckets/credentials are not provisioned. Image validation/variants and manifest boundary tests pass; QA voting uses controlled mock media registry records. Migration `plan` found 45 unique source objects. No remote R2 copy, delivery verification, reference switch, restart/rollback or deletion occurred. Competition-image submission deliberately remains unavailable without private R2 configuration. Do not enable public voting in production before these gates pass.
- Real R2 CORS/private denial, expired/replayed uploads, concurrent finalisation, approval publication, custom-domain CDN cache headers and representative migrated rendering require staging credentials. Local mocks cannot certify these.
- Actual Vercel CDN hit ratios/request allowance consumption, Supabase monthly egress/CPU/quota headroom, Cloudflare operations/storage and billing eligibility were not available from this localhost/QA run. Provider dashboards and controlled staging load must be reviewed before production approval. No festival audience size or unlimited ₹0 capacity is inferred.
- Browser simulation is not physical-device or cross-browser certification. No long-duration festival-scale load, audience-wide Realtime subscription or per-second public polling was introduced.
- No production migration, deployment, paid activation, domain purchase or original-media cleanup was performed. Use [rollout and rollback instructions](COMPETITION-ROLLOUT.md); production approval and R2 prerequisites remain outstanding.
