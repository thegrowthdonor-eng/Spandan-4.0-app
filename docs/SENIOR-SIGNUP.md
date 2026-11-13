# PG / JR / FMG / Faculty signup and offline participation

Main Admin opens **Administration → PG / JR / FMG / Faculty signup links**, chooses the festival, expiry in IST and total account limit, and copies the private common link. Its token is shown only when creating/regenerating it. Regenerating invalidates the previous link; closing it prevents new signups without removing existing accounts.

The recipient enters name, mobile, category, unit, gender and password. Access activates immediately and the existing mobile/password login is reused. There is no OTP, document, payment or identity verification. The legacy `verified_at` field records access activation to satisfy the installed access constraint; it is not evidence of identity verification. The pass labels senior access accordingly.

Every senior event application saves only in `senior_event_registrations`. The user sees **Applied successfully** and **Confirmed** in My Fest. Organisers see details in **PG / JR / FMG / Faculty entries**, including a count of entries from the past 24 hours. Entries have no approval, withdrawal, squad, fixture, scoring or results workflow. All subsequent arrangements happen offline. The table is not a source for UG operations; database guards reject senior writes through the shared UG entrypoints as well.

Only the participant, assigned coordinator/category head, and active Main Admin may read the appropriate records. Contact details are never added to the public notification feed. The inbox is paginated and refreshed using its Refresh link. Voting remains available under existing account/window/receipt rules. Suspension blocks new entries and voting and revokes outstanding competition grants; it does not delete prior votes or participation history.

The browser restriction uses a signed HttpOnly cookie with a server-side registration record. Successful UG signup, authenticated login, or opening the join page with an existing session records that browser. Logout preserves the marker. Main Admin can reset a genuine shared-browser restriction with an audit reason. The mobile duplicate check does not prove ownership. Existing personal invitations and admin-issued password recovery remain supported, including FMG.

**Limit:** cookies can be cleared and another browser/device can be used. Existing UGs who logged out before this feature may have no marker. A leaked common link can create fake accounts and affect voting. This is an abuse limit, not college identity verification or physical-device identification.

## Verification

Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, and `npm.cmd run build`.

Database acceptance tests use in-memory PGlite, never a hosted project. Install the test tool outside application dependencies:

```powershell
npm.cmd install --prefix scratch/senior-db-tools --no-save --package-lock=false @electric-sql/pglite@0.5.16
$env:PGLITE_MODULE = (Resolve-Path scratch/senior-db-tools/node_modules/@electric-sql/pglite).Path
node scripts/verify-senior-database.mjs
```

The runner installs the repo migrations in memory, supplies local Auth/Storage scaffolding and runs `supabase/tests/senior_signup_and_entries.sql`. It omits one historical revoke for an archived hosted-only function that has no definition in this repo. SQL fixtures are rolled back. The SQL suite refuses to run unless the isolated-test session flag is present. Do not run it on production or the retired QA project.

## Release verification, 13 November 2026

- Hosted migration version `20261113121103` matches the repository filename. The scoped previous function/constraint definitions and row counts are in ignored `scratch/senior-pre-migration-schema-backup.json`.
- 123 unit tests passed. Local database checks cover all categories, token limits/revocation, browser/phone restrictions, server/member/guest permissions, UG isolation, coordinator privacy, general and session-bound competition voting, and suspension. 320px, 375px and 1280px browser checks exercised real UI components with mocked network responses.
- Typecheck and production build passed; lint has zero errors and seven pre-existing warnings. The build still logs the pre-existing missing committee-directory RPC and uses that page's existing fallback.
- Hosted schema/Data API and function permissions were checked after migration. Existing profile/application/group/fixture/result/points row counts were unchanged. No signup link, fabricated account, event registration or vote was created in production for testing. No new security-advisor warning was introduced; the three new private tables intentionally have no client RLS policy and are accessed only through restricted functions.

If rollback is needed, first close the shared signup links and restore the previous application deployment. Retain the additive schema, registrations, profiles, vote history and audit records; do not destructively down-migrate. The previous app cannot display the new senior entries, so restore this feature with a forward fix before directing seniors back to the app.
