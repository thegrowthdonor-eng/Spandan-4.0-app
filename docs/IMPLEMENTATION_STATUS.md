# SPANDAN 4.0 implementation status

Last updated: 14 October 2026 (Asia/Kolkata)

## Phase status

| Phase | Status | Evidence / next gate |
| --- | --- | --- |
| 0 - Reconciliation, architecture and feasibility | In progress | Baseline and decision register created; official Supabase and Vercel documentation rechecked. Authentication prototype and local setup next. |
| 1 - Identity, roles and activation | In progress | Guarded sign-up/sign-in/logout/recovery routes, private identity adapter, rate-limit, atomic profile provisioning and one-use recovery-token migrations now exist alongside activation RPCs; no Supabase project has applied or tested them yet. |
| 2 - Events, applications and selection | In progress | Head review, draft/published groups, membership and sports-captain controls are drafted. Requires a Supabase project to apply and policy-test; no live event data is created. |
| 3 - Fixtures, scores and standings | In progress | Versioned fixture/score/result/ledger migration and sport score validators exist. Committee point/tie policy and Supabase policy tests remain required. |
| 4 - Schedule, notices and support | In progress | Notice/reminder/poll/feedback/help schema and protected submission RPCs are drafted; schedule UI, staff workflows and Supabase policy tests remain. |
| 5 - Promotional content | In progress | Editable scheduled-banner, sponsor, media, stage, organiser and merchandise schema exists with published-only public policies. Dashboard and real approved content are pending. |
| 6 - Assistant and copilot | Not started | Requires provider/cost decision; core features remain independent. |
| 7 - PWA, QA and launch preparation | In progress | Manifest, icon, install registration and a conservative public-only offline fallback are implemented. Device/install/cache verification remains. |

## Requirement traceability

| Requirements | Intended implementation location | Acceptance / verification | Status |
| --- | --- | --- | --- |
| R01 | `src/app/events`, public anonymous Supabase client, published-only event RLS policy | T01 | In progress: dynamic public catalogue and event-detail pages now read through the anonymous client, so only database-published rows can render; real database/RLS verification and organiser event content remain pending |
| R02 | `app/(auth)`, `src/server/auth`, `supabase/migrations` | T02-T03 | In progress: batch-roll adapter, guarded sign-up/sign-in/logout routes, generic errors, persistent rate limit, pending-profile provisioning, main-admin-issued 30-minute one-use recovery token and redemption route are implemented locally; real Supabase auth/session proof is still required |
| R03 | `app/admin/activation`, access RPC/policies | T04-T05, T21 | In progress: audited treasurer/admin activation function and role boundary checks drafted; database tests pending |
| R04-R07 | event detail, application API, groups and transactional RPCs | T06-T10, T22 | In progress: public event detail now exposes an application action only while the published event is open; a same-origin, authenticated route sends a client idempotency key to the database RPC, which remains the authority for active-access/capacity/duplicate checks. Review/selection UI and database tests remain pending |
| R08, R13, R17 | My Fest, notices/reminders service | T11, T20 | In progress: protected My Fest page now reads only the signed-in student's profile, access state and applications; persistent in-app reminder and scheduled-notice data foundations exist, while schedule mutation and notification dispatch remain pending |
| R09-R12 | staff event tools, fixtures/scores/results/ledger RPCs | T12-T13 | In progress: fixture history, optimistic score versions, configurable point rules and superseding result ledger are drafted; staff UI and database verification pending |
| R14-R15, R21 | polls, feedback, help tables and server actions | T14-T15 | In progress: active-only one-vote, versioned feedback, and private help-thread RPCs drafted; UI/staff routing and policy tests pending |
| R16 | public event metadata/share-card route | T16 | Not started |
| R18-R20, R22 | authorised content dashboard and public content routes | T17 | In progress: data model supports scheduled publication, banners/order/visibility, sponsor privacy, rights/alt text, stage reveals and display-only merchandise; UI/policy tests pending |
| R23 | admin dashboard, exports, audit log | T18 | Not started |
| R24 | manifest, service worker and cache controls | T19, T23 | In progress: manifest, icon and service worker exclude account/admin/API paths; browser/device cache verification pending |

## Known blockers

1. The committee must confirm the edition year, official college name, eligible batch/course identifiers, and event data before public registration can open.
2. The committee must publish points, tie, shared-place, disqualification and mixed-batch cultural policies before results can affect standings.
3. Production hosting needs a paid/compliant provider decision. Vercel Hobby is not assumed eligible for a sponsor-supported fest.
4. Supabase phone/password with no confirmation is a proposed adapter and needs a real-project prototype before Phase 1 is marked implemented.
