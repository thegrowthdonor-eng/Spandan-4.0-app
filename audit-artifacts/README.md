**Audit evidence — 22 October 2026**

Start with [AUDIT-REPORT.md](AUDIT-REPORT.md).

- browser-results.json: 104 mobile route observations and API smoke checks.
- database-results-1/2/3.json: raw rollback assertions; see report caveats before interpreting failed assertions.
- rollback-suite-1/2/3.sql: synthetic database scenarios. Each starts BEGIN and ends ROLLBACK. Run the complete file, never just its setup portion.
- auth-results.json: actual auth API observations, including initial cleanup failures and early senior-render assertions superseded by the follow-up test.
- interaction-first-attempt.json: mobile install-banner obstruction.
- interaction-results.json: follow-up clicks, CSV, upload, hydrated senior pass and offline catalogue.
- audit-db-functions.sql: deployed function snapshot; useful for comparing database/source drift. This is evidence, not a migration.
- PNGs: browser screenshots. participant-admin.png demonstrates the role bypass.

The CJS scripts are execution records, not ready-made CI tests. They require this repository as the working directory, configured environment variables, a running production server on localhost:3000, and the local Playwright/browser paths used in this session. They create temporary remote test data. In particular, audit-auth.cjs exposes the app's senior deletion defect and needs the explicit private-table cleanup documented in the report; do not rerun it unattended. Secrets are loaded from environment, not embedded in these new scripts.

Final cleanup verification after all test runs: 0 AUDIT editions, 0 AUDIT profiles, 0 matching audit auth users, 0 fest-media objects under audit-temp/. The earlier cleanup errors were resolved through deletion of only the exact test records and their private references. SQL-suite rows never committed. Ordinary app data was not deliberately changed; provider audit/rate-limit telemetry may retain the test requests until normal expiration.

No application source or deployed schema was changed by this audit. The pre-existing .vscode directory was left untouched.
