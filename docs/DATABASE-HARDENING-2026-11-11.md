# Production database warning hardening

Owner requested direct production changes, not QA. Applied four additive/permission migrations to production `uytvtmkapusjjqhjyopd` on 11 November 2026. No app feature or production data deletion was included.

## Changes and evidence

- Optimised 12 existing RLS policies with per-statement `auth.uid()` evaluation, preserving predicates.
- Split merchandise/sponsor public, authenticated-read and administrator-write policies without overlapping SELECT policies.
- Added 14 indexes for existing identity, team, fixture/history, help, poll and standings query paths. Cold author/audit FKs remain for workload-driven review.
- Revoked API-role execution on two legacy result publishers, whose public interfaces bypassed the expected publication-version parameter. Existing row triggers already guarded stage/voting publication; those triggers remain. The current unified publisher is unchanged.
- Profile deletion is server-only; current signup/admin API callers already use the service-role client. Anonymous activation-queue execution was removed; signed-in authorised callers remain supported.
- Removed API-role TRUNCATE/REFERENCES/TRIGGER privileges across existing application tables and standings views. Removed unused direct table mutations, retaining authenticated merchandise/sponsor/push-subscription writes and all server/service-role access. Existing public SELECT and safe poll-option column grants are preserved.
- Postgres-created future public tables no longer inherit those three maintenance privileges. Supabase-managed owner defaults were not modified; future migrations must still explicitly review grants/RLS.
- Read-only, rolled-back regression checks in `supabase/tests/database_hardening.sql` passed on production. Verified all 18 existing identities for own-profile isolation and unchanged published/admin sponsor/merchandise visibility. Invalid vote capability rejected; hidden vote totals unreadable; current publisher/voting grants preserved.
- Profiles/events/ballots/publications remain 18/2/0/0. No users, media, votes, scores or publications removed. Recovery snapshots of functions/ACLs/policies and table grants are retained locally under ignored `scratch/production-*backup.json` files, not in Git.
- Live schedule, Live Ground, standings, merchandise and public live API returned HTTP 200 after table hardening.

## Advisor outcome and limits

Performance advisor: repeated-auth RLS findings 12 → 0; overlapping-policy findings 2 → 0; missing-FK-index suggestions 59 → 48. Unused-index notices increased 21 → 35 immediately after creating indexes; this is not evidence that new indexes are unnecessary, and no index was deleted.

Security advisor: anonymous SECURITY DEFINER notices 10 → 9; authenticated notices 126 → 123. Remaining public projections and capability-voting/RPC architecture still generate notices. Eighteen RPC-only/private tables retain intentional default-deny RLS without public policies. This is scoped review and testing, not an exhaustive penetration test or certification of every legacy path.

Supabase leaked-password checking requires Pro or above per https://supabase.com/docs/guides/auth/password-security; no paid setting activated. The eight frontend lint warnings are unrelated to these DB migrations and unchanged.

## QA project deletion blocked

Verified disposable project: `rgcevrvxfunmwephhomy`, **Spandan 4.0 Visual QA**. Production is the other project, **Addy's Project**. No QA project or local QA assets were deleted. CLI delete requires a Supabase management login (`AccessTokenRequiredError`); connected MCP lacks project deletion, and browser access host is unavailable. Owner must authenticate the CLI securely or delete the verified QA project in the dashboard. Do not paste a management token into chat or delete the production project.

## Rollback

Use scoped pre-change ACL/policy snapshots for a reviewed restoration, not a blanket grant-all. Do not re-expose legacy publishers or TRUNCATE to API roles. New indexes are additive and can remain during a permission rollback. Retain all history and real data. No destructive schema rollback is needed.
