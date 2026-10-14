# SPANDAN 4.0 — Data model and access rules

Version 1.0 | 14 October 2026

## Core records and constraints

This is a logical schema to guide migrations, not executable SQL. Use UUID primary keys internally and a separate human-readable Fest ID. Store timestamps in UTC and display Asia/Kolkata. Include edition_id on edition-specific data so future reuse does not mix registrations.

| Record | Key fields and invariants |
| --- | --- |
| editions / batches | Edition name, dates, timezone, status; eligible batch/course definitions. Year and official labels are configuration. |
| profiles | auth_user_id, name, batch_id, roll_canonical, private phone, fest_id. Unique(batch_id, roll_canonical) and unique fest_id. |
| access_records | edition_id, profile_id, pending/active/rejected/suspended, verifier, verified_at, minimal ledger reference and reason. Unique edition/profile. |
| staff_assignments | user_id, role, event_id where applicable; only main admin grants roles |
| events | category, solo/pair/group/sport format, rules, eligibility, capacity, windows, reporting/start/end, venue, state, roster_lock_at |
| applications | event_id, student_id, review_status, selection_status, submitted_at, answers, reviewer/reason. One record per event/student; history separate. |
| groups / memberships | event_id, batch_id where required, name, captain_id; membership references approved application. One active group per event/student. |
| fixtures / score_snapshots | event_id, opponents, round/stage, timing, status, sport_type, validated score payload, version, updater/time |
| results / point_rules | event_id, placing, recipient/group, publication version; points keyed by edition/event/place. No duplicate active result for recipient/place. |
| points_ledger | result_version, batch, points; transactional replacement/reversal when result changes. Derived totals, not editable totals. |

Canonicalise batch and roll according to the college's actual identifier scheme. Preserve significant leading zeros if required; do not guess that 047 and 47 are different students. Batch/course combinations must uniquely identify a student, or add the required course discriminator before launch.

## Supporting data and role permissions

| Record | Purpose and constraints |
| --- | --- |
| notices / reminders | Scope, publish time, urgency, audience; reminders link to source version to invalidate stale times |
| polls / options / votes | Eligibility, open/close time; unique poll/student vote; public aggregate only after close |
| help_threads / messages | Owner, optional event, assignee, state; private threaded replies; attachments excluded initially |
| feedback | Form/event, student, ratings/text, submission version; one editable response per configured scope |
| sponsors / placements | Tier, logo, approved text, link, associated event; no participant contact dataset |
| media / stage / merchandise | Asset URL, publish state, rights/consent note, alt text; stage timings and approved artist details |
| audit_log / recovery_tokens | Actor/action/object/time/reason and redacted change; recovery token hash, expiry, attempt count, used_at |
| auth_identity_map | Server-only batch-roll to auth identifier mapping; inaccessible to public/student database clients |

| Role | Read and write boundary |
| --- | --- |
| Public | Read published event, fixture, score, result and promotional content; no private profiles |
| Pending student | Read/update own permitted profile, access status and help; cannot apply/vote |
| Active student | Own applications, group view, schedule, vote and feedback; no direct role/access/result updates |
| Event head | Assigned-event applicants/contact details as needed; reviews, grouping, captain, fixtures, scores, results and event notices |
| Treasurer | Identity/contribution activation and relevant private profiles; no implicit authority to alter scores |
| Main admin | Roles, global configuration/content and audited corrections; recovery and activation |
| Captain | Participant permissions only plus visible team role |

Apply database row policies and column-safe public views, not only client filtering. Never expose phone or roll in public squads. Limit exports to authorised scope and record who exported. No participant data should be shared with sponsors by default. Prevent role changes through user-editable metadata. Supabase RLS and server-only secrets are relevant implementation foundations [S5].

## State transitions and transactions

### Independent state machines

Access: pending -> active or rejected; active -> suspended; rejected/suspended -> active only after verified review. Application: submitted -> approved, rejected or waitlisted; waitlisted -> submitted/approved when a place is offered; permitted withdrawal -> withdrawn. Selection: unselected -> selected/reserve/not_selected; selected -> removed only through a reasoned head action. An approved record is not automatically selected.

Event: draft -> published/open -> closed -> ongoing -> completed; cancellation may occur after publication with notice. Result: draft -> published -> superseded on correction. A superseded result remains auditable but contributes no active points.

### Atomic operations

Registration locks/checks availability, validates current access/eligibility/deadline, then inserts or returns the existing application in one transaction. Capacity counts the configured unit explicitly: applicants, pairs or groups. For head-created groups, track applicant capacity separately from final group capacity.

Group publication validates current active access, approved applications, group size and batch policy. Result publication validates recipient membership and ranks, then writes results and points together. Correction retires prior points and inserts replacement points atomically; refresh totals only after commit. Poll submission checks time and eligibility with a unique constraint. Score writes compare an expected version and reject stale updates.

### Proposed validation rules

Names: trim spaces, allow ordinary Unicode names, cap length at 100 characters. Phone: normalise to E.164, default India +91 with validation; possession is not proven by format. Password: proposed minimum 12 characters, permit password managers and paste, no arbitrary composition puzzles. Phone changes and batch-roll corrections require staff review after activation. Avoid storing government ID scans; visually check college ID or use an authorised roster.

### Lifecycle

Proposed retention: close new registrations after fest; keep private records for 90 days after 26 November to resolve corrections, then remove unnecessary phone/help data and retain approved public results. Committee must approve the period. Backups follow the same retention policy. Account deletion requests require identity verification and an explicit decision on retained competition history.
