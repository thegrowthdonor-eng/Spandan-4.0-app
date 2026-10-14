# SPANDAN 4.0 test report

Last updated: 14 October 2026 (Asia/Kolkata)

## Executed checks

| Date | Check | Result | Evidence / limitation |
| --- | --- | --- | --- |
| 2026-10-14 | Workspace inventory | Passed | Eight numbered Markdown and DOCX sources, master DOCX/PDF, `content.json`, and README were found. No application source or Git repository existed. |
| 2026-10-14 | Requirements consistency | Passed with no material conflict | Master DOCX agrees with the eight Markdown documents for the baseline; the DOCX is supporting/reference material. |
| 2026-10-14 | Supabase authentication feasibility review | Pending prototype | Official docs confirm supported password identities are email or phone, not batch-roll. |
| 2026-10-14 | Vercel hosting eligibility review | Blocked for Hobby production | Official docs restrict Hobby to non-commercial personal use. |
| 2026-10-14 | `npm run typecheck` | Passed | TypeScript compiler completed with no diagnostics. |
| 2026-10-14 | `npm run lint` | Passed | ESLint completed with no diagnostics after the Next.js flat config was added. |
| 2026-10-14 | `npm run build` | Passed | Next.js 16.4.0 production build compiled, type-checked and statically generated `/` and `/_not-found`. |
| 2026-10-14 | `npm test` | Passed | Three deterministic auth-identity tests passed: canonicalisation, stable private identifier generation, and short-pepper rejection. |
| 2026-10-14 | `npm run build` after account route | Passed | Production build compiled, type-checked and statically generated `/`, `/account`, and `/_not-found`. |
| 2026-10-14 | `npm test`, typecheck, lint and build after PWA baseline | Passed | Build generated `/`, `/account`, `/offline`, and `/manifest.webmanifest`; service worker behavior still needs real-browser offline/cache inspection. |
| 2026-10-14 | Competition validator unit tests | Passed | Five total unit tests passed, including legal-ball cricket rendering and invalid sport-payload rejection. Database score conflict/result-ledger tests remain blocked on a Supabase test project. |
| 2026-10-14 | Browser rendering check | Unavailable | No automation browser surface was available. Local server started successfully at `http://localhost:3000`; visual/device review is still required. |

## Not yet executable

No application, migrations, Supabase project, seed data or automated test harness existed at the start of Phase 0. T01-T24 remain unexecuted. No pass result is implied by the planned test catalogue.

## Next verification gates

1. Run local type check, lint and build after scaffold creation.
2. Execute the auth adapter prototype against a disposable Supabase project before accepting its design.
3. Apply `202610140001_phase1_identity.sql` and `202610140002_events_and_applications.sql` in a disposable Supabase project, then run direct policy tests for T01, T04, T06 and T07.
4. Verify PWA installation and offline behavior on Android Chrome, iOS Safari and desktop Chrome/Edge; specifically inspect that account/admin/API responses are not cached.
5. Apply `202610140003_competition_and_standings.sql` and run direct tests for stale scores, duplicate result publication and correction-ledger replacement (T12-T13).
