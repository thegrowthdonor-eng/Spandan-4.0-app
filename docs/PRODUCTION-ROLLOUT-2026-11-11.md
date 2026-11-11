# Production rollout — 11 November 2026

Owner explicitly approved production database changes, GitHub push and Vercel deployment.

- App revision: `b2a32ee`, including the preceding scoring and competition commits.
- Production Supabase: `uytvtmkapusjjqhjyopd`.
- Applied `competition_simplified_production_rollout` atomically: the three missing 7 November admin migrations (merchandise/sponsor policies, optional ledger reference, fixture deletion), followed by all 24 competition/simplification migrations from `20261110174448` through `20261111135025`, in file order. The combined migration is recorded remotely; do not replay its constituent files against production merely because their individual timestamps are absent.
- Initial transport serialization attempt failed on SQL parsing, with no schema change; corrected SQL succeeded.
- Before/after: 18 profiles, two events, zero fixtures and zero result publications. Football is `live_matches`; photography is `voting`. Both have settings; all new public competition tables have RLS enabled.
- Pre-change event records, function definitions/ACLs and column metadata were saved locally in ignored `scratch/production-pre-migration-backup.json`. This is a scoped recovery snapshot, not a full database backup.
- Vercel production deployment: `dpl_33XVvFLm6jJbdFBHTBAsQurgJguM`; built successfully using production environment, initially without switching the public domain.
- Unit tests: 76 passed; typecheck passed. Prior integrated QA and mobile browser evidence is in `COMPETITION-QA.md`. Production public-route checks passed before promotion; authenticated production mutations were not fabricated for testing.

Earlier documents saying production had not been changed describe the pre-rollout state and are superseded by this record.

## Remaining operational limits

R2 credentials/buckets/custom domain remain unconfigured: no media copy, reference switch or deletion was performed. Photography image-entry launch still needs R2 validation and configured submission/voting windows. No paid provider settings changed. Physical-device certification, production stress testing and provider quota headroom are not established by these checks.

Rollback must coordinate compatible app and RPC versions as described in `SIMPLIFIED-OPERATIONS.md`; retain scores, ballots and audit history. Do not blindly restore the old application or destructively reverse schema changes.
