# SPANDAN 4.0 implementation status

Last updated: 14 October 2026 (Asia/Kolkata)

## Phase status

| Phase | Status | Evidence / next gate |
| --- | --- | --- |
| 0 - Reconciliation, architecture and feasibility | In progress | Baseline and decision register created; official Supabase and Vercel documentation rechecked. Authentication prototype and local setup next. |
| 1 - Identity, roles and activation | In progress | Initial versioned identity/access/role/audit migration exists; no Supabase project has applied or tested it yet. |
| 2 - Events, applications and selection | In progress | Event/application schema and transaction-safe application RPC drafted. Requires a Supabase project to apply and policy-test; no live event data is created. |
| 3 - Fixtures, scores and standings | In progress | Versioned fixture/score/result/ledger migration and sport score validators exist. Committee point/tie policy and Supabase policy tests remain required. |
| 4 - Schedule, notices and support | Not started | Requires Phase 1. |
| 5 - Promotional content | Not started | Requires approved assets/content. |
| 6 - Assistant and copilot | Not started | Requires provider/cost decision; core features remain independent. |
| 7 - PWA, QA and launch preparation | In progress | Manifest, icon, install registration and a conservative public-only offline fallback are implemented. Device/install/cache verification remains. |

## Requirement traceability

| Requirements | Intended implementation location | Acceptance / verification | Status |
| --- | --- | --- | --- |
| R01 | `app/(public)/events`, published-content database views | T01 | In progress: published-only event RLS policy drafted; catalogue UI and database verification pending |
| R02 | `app/(auth)`, `src/server/auth`, `supabase/migrations` | T02-T03 | In progress: adapter design selected; private mapping schema drafted, not yet proven |
| R03 | `app/admin/activation`, access RPC/policies | T04-T05, T21 | In progress: access/audit schema drafted; operations not yet implemented |
| R04-R07 | event detail, applications, groups and transactional RPCs | T06-T10, T22 | In progress: idempotency/one-per-event constraints and an event-row-locking apply RPC drafted; selection/group operations pending |
| R08, R13, R17 | My Fest, notices/reminders service | T11, T20 | Not started |
| R09-R12 | staff event tools, fixtures/scores/results/ledger RPCs | T12-T13 | In progress: fixture history, optimistic score versions, configurable point rules and superseding result ledger are drafted; staff UI and database verification pending |
| R14-R15, R21 | polls, feedback, help tables and server actions | T14-T15 | Not started |
| R16 | public event metadata/share-card route | T16 | Not started |
| R18-R20, R22 | authorised content dashboard and public content routes | T17 | Not started |
| R23 | admin dashboard, exports, audit log | T18 | Not started |
| R24 | manifest, service worker and cache controls | T19, T23 | In progress: manifest, icon and service worker exclude account/admin/API paths; browser/device cache verification pending |

## Known blockers

1. The committee must confirm the edition year, official college name, eligible batch/course identifiers, and event data before public registration can open.
2. The committee must publish points, tie, shared-place, disqualification and mixed-batch cultural policies before results can affect standings.
3. Production hosting needs a paid/compliant provider decision. Vercel Hobby is not assumed eligible for a sponsor-supported fest.
4. Supabase phone/password with no confirmation is a proposed adapter and needs a real-project prototype before Phase 1 is marked implemented.
