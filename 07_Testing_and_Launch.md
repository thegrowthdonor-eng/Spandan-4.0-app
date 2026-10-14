# SPANDAN 4.0 — Testing and launch checklist

Version 1.0 | 14 October 2026

## Acceptance test catalogue

This is a test plan, not a test report. No application has been built or tested in this document task. Execute with synthetic profiles from at least two batches, one pending student, two active students, two event heads, a treasurer and a main admin.

| Test | Expected outcome |
| --- | --- |
| T01 R01 Public/draft access | Public reads only published content; direct draft URL/API denied |
| T02 R02 Signup collision | Concurrent same batch-roll creates one claim; no duplicate active identity |
| T03 R02 Login/recovery | Correct password works; unknown/wrong returns generic error; throttle persists; reset token expires and cannot be reused |
| T04 R03 Activation bypass | Pending/rejected/suspended user cannot apply through UI or direct API |
| T05 R03 Role boundary | Head/student cannot activate or grant roles by edited request or metadata |
| T06 R04 Duplicate/capacity | Double submit returns one entry; simultaneous last-place claims never overfill |
| T07 R04 Rules | Closed window, ineligible batch and roster lock enforced on server clock |
| T08 R05 Head isolation | Head A cannot export/review Head B's applicants or contacts |
| T09 R06 Groups | Only approved eligible applicants selected; batch/size/duplicate-membership rules enforced; captain is selected member |
| T10 R07 Withdrawal | Allowed before lock; after lock becomes a request; history preserved |
| T11 R08 R17 Schedule | Reschedule updates personal entry, warns clashes and suppresses obsolete reminder |
| T12 R09 R10 Scores | Cricket legal balls render valid overs; football/badminton rules validated; stale version rejected |
| T13 R11 R12 Results | Republish same result adds zero duplicate points; correction replaces prior points; ties follow configured rule |

Security checks must use direct API requests as well as the normal screens. Save expected result, actual result, test date, commit ID and evidence reference for each test. A passed UI test does not establish database policy correctness.

## Engagement checks and release gates

| Test | Expected outcome |
| --- | --- |
| T14 R14 Voting | One vote per eligible account; closed poll rejects; concurrent vote retries do not duplicate |
| T15 R15 R21 Privacy | Student sees only own feedback/help; public cannot query phone, roll, recovery or private application tables |
| T16 R16 Sharing | Cards contain no private identifiers/tokens; shared URL opens the correct event |
| T17 R18 to R22 Content | Draft reveals hidden; authorised publish works; links valid; merchandise has no checkout |
| T18 R23 Audit/export | Scoped exports and admin changes audited; CSV cells cannot execute spreadsheet formulas |
| T19 R24 Offline | Public cache labelled stale; private data not cached; offline mutation never falsely confirmed |
| T20 Reminders/permission | Denied push still leaves in-app reminder; duplicate sends avoided |
| T21 Session revocation | Suspend/reset blocks protected writes from an already open session |
| T22 Failure recovery | Interrupted signup/publication is recoverable; no orphan active identity or partial points |
| T23 Accessibility/devices | Android/iOS install paths, keyboard, labels, contrast and reduced motion checked |
| T24 Backups | Restore schema/data and asset references to a test environment; validate sampled registrations and totals |

### Load and endurance

Proposed baseline: 1,000 synthetic profiles, 50 events, 10,000 applications, 100 simultaneous mixed users for 30 minutes and 300 score readers during a four-hour rehearsal or equivalent staged test. Measure API latency, error rate, database/egress usage and connection count. If 1,000 simultaneous readers are expected, add that test explicitly; total users do not equal concurrency. Use a local/staging environment first and respect provider limits.

### Go or no go

Launch only when all access/integrity tests pass, there are no unresolved critical/high-severity defects, auth and hosting gates are resolved, event content is approved, staff have rehearsed, restore/rollback is demonstrated and monitoring contacts are named. Confirm zero live payment/QR-check-in features slipped into scope. Keep a known-good deploy and migration-compatible rollback path. If a blocker remains, issue a no-go report with owner and remedy; do not describe the app as production ready.
