# SPANDAN 4.0 — Organiser operations and handover guide

Version 1.0 | 14 October 2026

## Daily procedures and incident handling

### Treasurer procedure

Review pending profiles daily. Match batch/roll/name to the college roster or college ID and reconcile the common contribution externally. Record only the minimum ledger reference and activate. Do not mark someone active solely because they claim to have paid. Incorrect activation must be suspended with a reason and reviewed; never delete their history to hide the mistake.

### Event head procedure

Before registration opens, complete rules, eligibility, capacities, dates and coordinator details. Review applications and communicate reasons. Select the batch squad or cultural group directly; assign sports captain; publish roster only after validating size and membership. Keep head role and captain tag distinct. Before play, verify opponents, stage, venue and score template. During play, update official score snapshots; afterwards publish positions and review the resulting batch points.

### Corrections and disputes

A wrong score is corrected through a versioned update with a note. A wrong final result is superseded, never added as a second result. Admin/head records the dispute, evidence and decision. When rules are unclear, the committee decides before publication. Do not invent tie-breakers after seeing the standings.

| Incident | Response |
| --- | --- |
| Lost password/claimed identity | Verify student through authorised roster/college ID; authorised admin issues one-use reset; revoke old sessions |
| Internet/service outage | Post outage notice if possible; heads use exported lists and manual official score records; reconcile once restored |
| Traffic/quota pressure | Reduce score refresh frequency, cache public snapshots, disable nonessential auto-refresh; preserve registrations and show delays |
| Private data exposure | Restrict affected endpoint, rotate exposed secrets if any, preserve logs, inform organiser and assess affected records |
| Mistaken suspension/activation | Investigate ledger/identity record, correct through audited action and notify affected student privately |

Do not accept an offline entry silently into the app without later validation. During recovery, reconcile by student/event identity and record original time plus entry operator. If capacity or deadline is disputed, refer to the event head rather than overriding automatically.

## Handover and source register

### Handover package

Provide source repository, deployment instructions, environment-variable names without values, schema/migrations, role roster, content ownership list, backup and restore instructions, test evidence, known issues and emergency contacts. Committee-controlled accounts should own production services; protect admin access and recovery. Exact ownership and retention approvers remain TBD.

### Use of this document set

Confirmed items reflect the requirements conversation through 14 October 2026. Proposed defaults and technical recommendations are not retrospective user approvals. Before implementation, copy unresolved decisions into the issue tracker with owner/date. Eight editable documents, their Markdown equivalents and a combined master are included. The master PDF is the review copy; update source documents together to avoid divergence.

### Sources checked 14 October 2026

S1 Supabase Password based Auth: https://supabase.com/docs/guides/auth/passwords — supported identifiers and password flows.

S2 Supabase Pricing: https://supabase.com/pricing — published free-plan allowances, pausing and backup limitations.

S3 Vercel Hobby: https://vercel.com/docs/plans/hobby — plan scope and limits.

S4 Vercel Fair Use: https://vercel.com/docs/limits/fair-use-guidelines — personal/non-commercial restriction.

S5 Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security — database access policies and privileged key handling.

S6 MDN Installable PWAs: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable — browser-dependent installability.

S7 Pulse public site: https://pulseasa.org/ — event, dashboard, media, support and sponsor patterns; public pages only.

S8 Pulse legacy site: https://pulseaiims.wixsite.com/pulse — anthem and aftermovie presentation.

Provider details are time-sensitive and must be rechecked before production. The technical design, acceptance thresholds, operational policies and effort estimates are proposals for this project, not statements endorsed by these sources.
