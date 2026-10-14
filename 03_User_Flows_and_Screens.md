# SPANDAN 4.0 — User flows and screen specification

Version 1.0 | 14 October 2026

## Navigation and student experience

| Area | Screens and primary action |
| --- | --- |
| Home | Fest identity, date, current notice, countdown/happening now, featured event, stage reveal, sponsor strip; Explore events |
| Explore | Search and category/day/status filters; event detail with rules, eligibility, slots, venue, head and Apply |
| Live | Fixtures, match detail, score status, final results and batch table |
| My Fest | Access status, applications, selection/group, personal schedule, reminders and Fest ID |
| More | Sponsors, gallery, media, merchandise, organisers, FAQs, help and feedback |
| Account | Create profile, batch-roll login, password recovery, edit contact details, logout |
| Admin | Activation queue, assigned events, applicants, groups, fixtures, score entry, results, notices, content and audit |

### Primary flows

Visitor: poster/social link opens event detail; browse without login; Apply opens login/create profile. After profile creation, pending activation page explains who verifies contribution and how to contact support. It must not show a checkout or imply payment was taken by the app.

Active participant: open event, read rules, confirm participation, receive application status. The event head approves/rejects; approval permits selection. Head builds the final squad/group. Student sees a selection notice, captain tag where relevant and schedule. Rejection and non-selection are shown separately.

Cultural participant: select event, provide role/skill/preferences requested by its head, apply individually. The head creates pairs/groups from approved applicants and publishes membership. Do not ship captain-created group registration from earlier planning.

### Required screen states

Every list needs loading, empty, error and retry states. Event detail needs closed, full/waitlist, ineligible, already applied, cancelled and rescheduled states. My Fest needs pending contribution, active, suspended and no applications states. Media and stage pages need 'To be announced' rather than fabricated artists or dates.

## Staff flows and interaction details

### Treasurer activation

Search student by batch-roll or Fest ID; inspect profile; verify identity against college ID/authorised roster and external contribution ledger; record minimal verification reference; activate. Confirmation appears in the student's account without needing an email. Bulk activation requires a preview and per-row error report. An event head never gains treasury rights from their captain/head label.

### Head workflow

Open assigned event; filter applicants by batch and status; review entries; select approved members into teams/groups; assign captain within each selected sports squad; publish roster; create fixtures or performance slots. During competition, enter a score using the sport template, review and save. On completion, enter positions, preview leaderboard impact and publish. Corrections require a reason and preserve the previous version.

### Help and recovery

Student opens account help without login for recovery instructions. Identity verification is handled by the authorised help desk/admin, not by publicly exposing account existence. An approved recovery produces a short-lived, single-use reset token. After reset, revoke existing sessions and show success. Do not send passwords through group chats or let staff view existing passwords.

| Interaction | Proposed behaviour |
| --- | --- |
| Clashing times | Warn with both event names and times; allow application unless event rule blocks it |
| Expired session during submission | Preserve non-sensitive form draft; re-authenticate; retry using the same submission key |
| Offline score view | Keep last public snapshot; show offline and update timestamp |
| Offline admin update | Disable final confirmation; do not queue silent roster/result writes |
| Rescheduled fixture | Replace old schedule entry; notify affected participants and followers |
| Suspended account | Block new protected actions immediately; existing selection is flagged for head review, not silently deleted |
| Captain tag | Visible role within selected squad; no scoring, treasury or admin privileges |
| Deleted/cancelled event | Retain registration history; show cancellation and contact route |

Proposed desktop admin layout: left navigation, event selector, searchable central table and contextual action panel. Mobile head tools prioritise applicant search and large score controls. Confirmation dialogs name the event, action and affected count; success messages reflect actual server outcomes.
