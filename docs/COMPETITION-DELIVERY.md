# Competition and infrastructure delivery

Branch: `feature/competition-voting-r2`. Production changes and deployment require approval.

## Accepted scope

- Preserve fixtures, explicit IST-day start, offline checkpoints and cricket reconciliation.
- Complete the checkpointed scoring shortcut and atomic start/device preparation.
- Separate participant format from scheduling/result mode. Support heats, flights, running order, common sessions and submissions; no in-app faculty judging.
- Entries: one per eligible entrant/event, participant or assigned staff submission, moderation, deadline and voting freeze.
- Voting: active accounts, direct Supabase calls after a scoped capability bootstrap, immutable ballots, atomic counters, hidden totals, runoff for podium ties, existing results/points publication.
- R2 Standard: private staging and approved public media, configurable custom domain, validation/variants, resumable verified migration retaining originals.
- Notifications: five-minute visible-only shared polling, backoff; preserve Web Push and unread state.
- Public score caching remains approximately 60 seconds; local clocks never write on ticks.

## Completion gates

- [x] Typed operation settings and session UI/RPCs with ownership/version/history checks
- [x] Measurement/ranking and confirmed official results
- [x] Atomic start/scorer and pre-start bookmark UI
- [x] Entries/gallery/moderation/direct voting/runoff/points integration (QA fixture media; real uploads gated below)
- [ ] All uploaded media paths support R2; existing URLs/edit/delete remain compatible
- [ ] Migration manifest, verify, rollback; tooling implemented/tested, real R2 copy/verify/rollback pending
- [x] Shared polling/cache and notification changes
- [x] Unit, database, browser, network and bounded QA voting concurrency tests (real R2 tests excluded)
- [x] Typecheck, lint and production build (eight existing lint warnings)
- [x] Observed QA resource measurements and deployment/rollback report: see `COMPETITION-QA.md` and `COMPETITION-ROLLOUT.md`
- [ ] Real provider quota/billing headroom, R2 staging gates and production approval

## External prerequisites

The user has not created Cloudflare/R2 yet. Real R2 staging tests need the user's account, staging buckets and credentials in secure environment variables. A custom domain will be purchased/connected by the user before production. Develop without waiting, but do not report remote R2 verification complete until it actually passes. Do not purchase domains, enable paid subscriptions, change production or remove originals without approval. No fixed traffic/user assumptions or unlimited-free claims.
