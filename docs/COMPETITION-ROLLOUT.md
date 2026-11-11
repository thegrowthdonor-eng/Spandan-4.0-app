# Competition, voting and media rollout

Branch: `feature/competition-voting-r2`. No production migrations, media-reference switches, deployment, purchases or paid subscription changes have been performed.

Read [SIMPLIFIED-OPERATIONS.md](SIMPLIFIED-OPERATIONS.md) first for the current revision. Its saved event methods, retired session controls, manual values and versioned-publication compatibility rules supersede the earlier operator steps below.

## Operator flow

1. Open **Competition & Schedule**, choose an existing event, confirm its scheduling/result method. Participation format, event names, registrations and existing fixtures are unchanged. Photography/rangoli presets suggest voting; other creative events are not automatically converted.
2. Matches use published teams/pairs or approved player rosters. **Run events → Start & Score** atomically starts the match and claims the scoring device. The fixture modal and scorer bookmarks use this same action. IST-day and permission checks run again in Postgres. A conflicting device cannot leave an unstarted match started.
3. Heats/flights/sessions: choose entrants, capacity and order; generate a deterministic private draft; move entrants/reorder or explicitly shuffle; publish. A brochure item can be linked deliberately. Create a separate final draft when advancing qualifiers; there is no automatic advancement/reseeding.
4. Start the published session on its IST date. Enter time in seconds/M:SS.xxx, distance in metres or whole counts. The database stores ms/mm/integers. Blank attempts are invalid/no mark; DNS/DNF/DQ are explicit. Ranking suggestions flag ties, never choose a winner by name/ID. Officials enter distinct confirmed places. Complete the final session, then publish winners/points through Results. Completed corrections require a reason.
5. Faculty events use running order/current-slot controls and approved final placings; there are no judge accounts, criteria or marks. Information-only programmes have session status/schedule but no scorer or results. An event editor reaches informational scheduling through the saved information-event editor link; ordinary editor access to competitive operations is not broadened.
6. Voting entries are reached from the event's **Schedule, entries & public voting** link or the admin voting workspace. Participants/captains and assigned staff submit one final image-backed entry per approved entrant. Before the deadline, replacing it sends it back to review, including a previously approved entry. Staff uploads can be retained by that entrant when resubmitting.
7. Review images privately; approve/reject with audited reasons where required. Approval publishes validated media; a failed image-publication step is retryable and blocks voting freeze until repaired. Configure point rules for every award position in Results, close submissions, review all options, then schedule the voting window. Award rules/options/content freeze from the first scheduled round onward, so the award cutoff cannot silently change during runoff resolution. Disqualification retains ballots. Verified rounds are locked.
8. One immutable ballot per active account/round. Hidden totals remain absent until close. Reconcile and verify; tied award groups require complete-group runoffs. A zero-vote round cannot create a winner; an unsuccessful round can be followed by a complete tied-group re-vote. Results is prefilled from verified voting/confirmed final-session places and publishes existing batch points.

## Supabase and caching

- **Operation history & corrections** loads authorised event history on demand, then individual before/after records when requested. Changed entrant rows retain previous measurements, places and correction reasons without copying the entire field into every audit record. Summary reads omit entrant details and entry descriptions. History is not exposed through public competition projections.

- Login stays HttpOnly. `/api/competition/voting` authenticates once and issues a random ten-minute round-scoped capability; only its SHA-256 hash is stored privately. The browser holds it only in memory. Subsequent vote calls go directly to `cast_competition_vote`; invalid/expired/revoked capabilities, inactive accounts, invalid options and closed windows are rejected. Retry receipts do not expose totals. Logout revokes capabilities before signing out.
- Public gallery/schedule metadata uses sanitised Supabase RPCs, browser 60-second deduplication, manual/visibility refresh and no audience-wide Realtime subscriptions. Direct Supabase is not a shared CDN cache.
- Live Ground uses a 60-second shared snapshot and cookie-free public requests. Origin-cache hits advertise only their remaining freshness, rather than restarting a second full CDN TTL. Match clocks tick locally from saved timestamps. Hidden pages do not poll. Non-match sessions and linked-programme de-duplication are included.
- Bell instances share a visible-only five-minute feed cache, deduplicate in-flight reads and back off on failure. Existing push/unread/reminders remain. No database write is added per public read.
- New tables deny direct end-user mutations; narrow definer RPCs check ownership/permissions/state/versions. Counter columns and private media/grants are not readable by anonymous clients. Ordinary festival polls remain in the existing widget and retain their behavior.

## R2 prerequisites — not yet verified remotely

The Cloudflare account, separate staging/private and approved/public buckets, scoped credentials and delivery domain must be provisioned securely by the owner. Never paste credentials into chat or commit them. No account, subscription, domain or bucket is purchased/created automatically.

Configure `.env`/hosting secrets from `.env.example`: `MEDIA_PROVIDER=r2`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PRIVATE_BUCKET`, `R2_PUBLIC_BUCKET`, `R2_PUBLIC_BASE_URL`, `R2_ENVIRONMENT`. Use R2 **Standard**, not Infrequent Access. Private and public buckets must differ. Production defaults reject `r2.dev`; an isolated staging environment may explicitly set `R2_ENVIRONMENT=staging`. Production requires the purchased HTTPS custom domain and approval.

Private-bucket CORS must allow only the intended staging/app origins, `PUT` and the `Content-Type` header. Presigned uploads use the R2 S3 endpoint, not the custom domain. Keep staging private, with no public bucket binding. Approved images are delivered from the public custom domain; browser image views never use Vercel's image optimiser.

Upload authorisations expire after five minutes. Finalisation checks MIME/signature, exact size, image dimensions/pixel count, and re-encodes static JPEG/PNG/WebP to metadata-stripped WebP. Full and thumbnail variants are generated once. Content-hashed private finalisation keys prevent concurrent/replayed input uploads from replacing the validated image. Public keys are immutable/versioned. Private reviews use 60-second signed reads. Mobile voting cards use thumbnail delivery with an explicit full-resolution link.

Posters, podiums, sponsors, merchandise and gallery upload callers use the provider adapter. Existing Supabase URLs continue working. The media registry stores provider/key/public URL/variants. Supabase remains the default until R2 verification/cutover is approved. Competition-image submissions intentionally report unavailable until private R2 staging is configured, rather than uploading unapproved work publicly.

Real R2 gates still required: private-object denial, successful signed upload, expired/replayed uploads, malformed/oversized files, failed/retried finalisation, concurrent finalisation, approval/rejection, direct custom-domain rendering, CORS and cache headers. Do not describe R2 as complete until those staging tests pass.

## Resumable migration and rollback

`scripts/migrate-media.ts` supports `plan`, `copy`, `verify`, `switch`, `rollback`, an explicit manifest path and bounded batch size (default 10, max 100). It discovers only this project's public `fest-media` objects referenced by events, podiums, sponsors, merchandise, organiser photos, media items or gallery moments. Manifest validation rejects foreign project URLs, traversal and unapproved table/column targets.

```text
node --env-file=.env.qa.local --import tsx scripts/migrate-media.ts plan scratch/media-manifest.json 10
node --env-file=.env.qa.local --import tsx scripts/migrate-media.ts copy scratch/media-manifest.json 10
node --env-file=.env.qa.local --import tsx scripts/migrate-media.ts verify scratch/media-manifest.json 10
```

Only `plan` has been run against QA so far (45 unique referenced source objects). `copy` records source/target hashes, dimensions, byte sizes, immutable keys/URLs and rollback references. `verify` downloads the delivery URL and checks target hashes/dimensions/format. Inspect representative poster/gallery/podium renders before any switch. The manifest is checkpointed atomically after each object; restarting repeats safe steps. Copying alone does not switch gallery references.

`switch` and `rollback` additionally require the explicit project-scoped `MEDIA_REFERENCE_APPROVAL` environment value, supplied only after owner approval. They compare the current reference before changing it and stop on concurrent edits. Rollback handles a partially switched manifest too, restores recorded originals and retains both copies. No command deletes source/target objects. Archive operations retain uploaded objects; original cleanup and staging-retention/lifecycle deletion require a separate approved retention policy. Retained originals/private variants consume storage and must be included in usage measurement.

## Production approval package

Before requesting deployment approval: finish R2 staging gates, record actual Cloudflare/Supabase/Vercel usage/remaining allowances, review provider billing/eligibility terms, inspect representative migrated images, and attach QA results. Do not infer an unlimited ₹0 capacity or a fixed audience.

With approval, back up the schema/reference manifest and record the current deployment. Apply the additive migrations in timestamp order, deploy this branch, then smoke-test permissions, IST start, offline recovery, public reads, voting and points. The final scoring migration removes end-user execute permission from the old non-atomic `start_fixture`; schedule the rollout in a maintenance window so cached older clients can reload to Start & Score. Keep `MEDIA_PROVIDER=supabase` until the separately approved R2/reference cutover. No original media deletion is part of deployment.

Rollback restores the recorded deployment/references while retaining ballots, scores and audit history; do not drop competition tables or destructively down-migrate. If restoring the older deployment's Start Match UI, explicitly restore its old execute grant (`grant execute on function public.start_fixture(uuid) to authenticated`) as an incident rollback step; reapply the atomic-only grant restriction when returning to this branch. This is a documented procedure, not an action performed in production.

## Reproduce QA

Run `npm run typecheck`, `npm run lint`, `npm test`, and `node scripts/run-qa-next.mjs build`. Serve that build with `node scripts/run-qa-next.mjs start --port 3002`. Using a production-mode QA build avoids two Next dev processes repeatedly rewriting shared generated type files.

`npm run qa:competition` refuses non-QA credentials/URL and creates only tracked fictional test events, removing them afterwards while retaining audit history. `npm run qa:competition:browser` additionally needs an installed Playwright module/Chromium (or `PLAYWRIGHT_MODULE`/`PLAYWRIGHT_EXECUTABLE` pointing to existing tooling). `QA_SCREENSHOTS=true` writes ignored scratch screenshots. Repeated test logins deliberately still respect the existing 10-attempt/15-minute account limit; wait for reset rather than weakening production authentication.

Run `supabase/tests/competition_operations.sql` and `competition_voting.sql` in isolated QA/local SQL execution; each wraps all changes in a rollback. Voting tests require a previously signed-in fictional QA owner so an Auth session fixture exists. Real R2 and production CDN behavior cannot be substituted by mock media records or localhost tests.

## Operational stop conditions

- Stop a stress ramp on any unexpected error, counter mismatch, sustained latency increase or insufficient measured quota headroom. Use tiny bounded batches before increasing concurrency.
- Normal voting closes at its configured window. For an incident requiring an immediate stop, cancel the event through its authorised event-management control; the database then rejects new votes while retaining existing ballots. Diagnose/reconcile before publication, and request an audited owner-approved recovery rather than modifying frozen options or fabricating a winner.
- If media validation/delivery fails, leave the previous reference in place and resume from the manifest. Revoke a compromised R2 credential, then reissue scoped credentials; never expose secrets in the client.
- Review provider dashboards for request/egress/storage/operation usage and billing alerts before increasing load. CDN hits still count toward relevant Vercel request allowances; direct votes only remove the vote-write hop.

References: [Supabase billing](https://supabase.com/docs/guides/platform/billing-on-supabase), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 presigned uploads](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
