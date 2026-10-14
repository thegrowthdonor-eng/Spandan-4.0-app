# SPANDAN 4.0 — Product requirements and acceptance criteria

Version 1.0 | 14 October 2026

## Accounts and participation

Requirement identifiers are shared with the testing document. Every state-changing action must be authorised on the server; hiding a button alone is insufficient.

| ID | Requirement and acceptance condition |
| --- | --- |
| R01 Public discovery | Visitors can search/filter published events by category, date and availability without signing in. Draft/private records never appear. |
| R02 Profile and login | Batch plus canonical roll number identifies the account. Required name and phone are collected. Wrong credentials return a generic error. Duplicate identities enter a recovery process, not a second active account. |
| R03 Activation | Only main admin/treasurer can activate, suspend or reject access. A reason, actor and time are recorded. Pending students can read their status but cannot register. |
| R04 Application | Active student submits once per event. Eligibility, deadline and capacity are checked transactionally. Double-click/retry creates one entry. Clear confirmation gives the current status. |
| R05 Event review | Assigned head approves, rejects with reason or waitlists. A head cannot read or edit another head's private applicant list. |
| R06 Selection | Head selects approved applicants into valid squads, pairs or groups. Minimum/maximum size and batch rules apply. Selected members see group, reporting time and captain where relevant. |
| R07 Student control | Proposed: students can correct permitted details and withdraw before lock. Identity changes after activation require admin review. Locked withdrawal becomes a head request. |
| R08 Personal schedule | Approved event commitments and selected match/performance slots appear with venue, reporting time and status. Changes update the same record and generate a reminder. |

### Status clarity

Show contribution access separately from event application and selection. An active account does not guarantee acceptance or a squad place. An approved applicant can still be unselected. Suggested copy: 'Approved for selection; final squad pending'. A changed event schedule should warn all affected students of new conflicts.

## Competition and engagement

| ID | Requirement and acceptance condition |
| --- | --- |
| R09 Fixtures | Head creates league or knockout fixtures with teams, stage, venue and start/reporting time. Admin validates venue and participant clashes. Rescheduling preserves history. |
| R10 Scores | Cricket supports innings totals, wickets, legal balls/overs and target; football supports goals, period and status; badminton supports games and points. Other sports use agreed templates. Every display has an update time. |
| R11 Results | Head previews and publishes final positions. Publication validates completeness. Corrections require reason/version and recalculate standings without double counting. |
| R12 Batch standings | Sum configured points from published positions only. No votes, reactions or participation points. Equal totals remain tied unless a published tie rule exists. |
| R13 Announcements | Global or event-specific notices show timestamp and urgency. Schedule changes link to the changed event. Only authorised publishers can target students. |
| R14 Polls | Activated students can vote once per poll within its window. Proposed: votes are final and totals hidden until close. Audience awards do not change official positions by default. |
| R15 Feedback | An activated student can submit or update one response for the configured fest/event survey. Responses are visible only to authorised staff; no public phone data. |
| R16 Sharing | Public event cards link to the event; participant cards require student action. Cards exclude phone, roll number, passwords and activation/recovery tokens. |
| R17 Reminders | In-app reminders persist even when notifications are denied. Time changes replace obsolete reminders. Optional push requires permission; delivery is best-effort, not guaranteed. |

### Live score boundaries

Live means head-entered score snapshots, with active-view refresh. Detailed commentary, automatic umpire feeds, player statistics and streaming are not included. Head edits need version checks: a stale tab must not overwrite a newer score. An offline write must not display as saved.

## Content and service quality

| ID | Requirement and acceptance condition |
| --- | --- |
| R18 Sponsors | Approved logos, tiers, descriptions and outbound links. Event sponsorship labels where supplied. No forced ads or student contact exports for sponsors. |
| R19 Media | Admin-curated compressed images and externally hosted video/audio links. Alt text/captions, rights confirmation and unpublished states. No student upload queue in launch. |
| R20 Stage and identity | Main Stage schedule, artist reveals with publish times, organising committee and event-head profiles. Contact visibility is explicitly approved. |
| R21 Help | FAQs plus signed-in private queries. Student sees their own thread; assigned head or admin sees routed queries. Emergency text points to verified local contacts rather than an unstaffed queue. |
| R22 Merchandise | Images, descriptions, sizes/availability and offline collection/contact instructions. No cart, reservation or checkout unless separately approved. |
| R23 Administration | Search/filter applications, bulk review with preview, Excel-compatible export, role assignments, content publishing and append-only audit records. Exports are event-scoped and logged. |
| R24 PWA | Responsive browser experience, manifest/icons, install guidance and safe offline shell. Cached public information is labelled stale; account and private API responses are not offline-cached. |

### Proposed measurable targets

Public page loading should target LCP at or below 2.5 seconds on a representative mid-range phone and reasonable mobile connection. Test API p95 below 1 second for reads and 2 seconds for writes at the agreed load, excluding external network latency. These are validation targets, not measured claims. Score refresh target is within 15 seconds while visible and online. If delayed, show the last successful update.

Support keyboard navigation, visible focus, labelled forms, readable contrast, 44 px touch targets, reduced-motion preferences and clear error messages. Test current Android Chrome and iOS Safari plus desktop Chrome/Edge. Security, access control, data integrity and accurate confirmations are release gates; cosmetic polish cannot compensate for failures.
