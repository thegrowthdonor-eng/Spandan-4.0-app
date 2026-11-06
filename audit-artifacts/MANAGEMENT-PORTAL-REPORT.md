# Organiser management portal — 7 November 2026

## Delivered

- Persistent role-filtered portal navigation and a Manage shortcut in the normal festival experience.
- Shared light workspace, mobile menu, 44px controls, consistent dialogs and event-specific Requests/Roster/Teams/Fixtures/Results links.
- Role-aware dashboard with real pending counts, direct event creation, searchable events and incremental list rendering.
- Complete draft editor with participation rules, sports metadata, registration questions, IST schedules, poster uploads, preview and publication controls.
- Solo approval selects the participant atomically. Existing approval/selection decisions are not backfilled.
- Team creation/member assignment/publication is atomic; existing drafts can resume and published team members/captains are visible.
- Main Admin settings separate roles, invitations and the global registration window.
- Editor poster uploads use event-definition permission; podium uploads still require event-operation permission.
- Original URLs and existing Results point locks, winner identities, scoring and gallery restrictions are retained.
- Replaced the obsolete dashboard and editor presentation; deleted source remains recoverable through Git history.

## Validation

- 49 unit tests passed; typecheck and production/QA builds passed.
- Lint: no errors; two existing warnings in maintenance and merchandise pages.
- QA reset and qa:verify passed, including transactional draft saves, schedule retention, structural locks, publication validation, role denial, approval/selection parity, bulk rollback, team rollback and member reads.
- Browser suite passed 56 route/viewport checks at 360, 390, 768 and 1440px without horizontal page overflow.
- Browser journeys covered accessible modal focus/Escape, full draft creation/publication, role-specific navigation, editor-owned draft creation and poster/podium permission separation.
- Desktop dashboard and mobile forms/review screenshots inspected. Local screenshots are under audit-artifacts/management and are not committed.
- Affected management RPCs deny anonymous execution and retain internal role/ownership checks.

## Database rollout

Shared migration chain applied to isolated QA and original production:

1. organiser_management_portal
2. management_form_guards
3. fix_management_question_validation

The forward fix resolves a validation alias ambiguity caught on QA before production rollout.
Production counts before and after remained: 35 events, 20 profiles, 1 application, 0 teams, 0 result publications, 66 point rules.
No QA identities, applicants, teams or results were copied into production.

Supabase advisors also report existing project-wide warnings outside this change. Deliberately authenticated, permission-checked management functions are covered by the [authenticated SECURITY DEFINER review guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

## Reproducing browser QA

Run a local Next build/start using the isolated QA environment. Then execute:

    node --env-file=.env.qa.local --import tsx scripts/verify-management-ui.ts

Playwright must be available externally; set PLAYWRIGHT_MODULE to its module directory and QA_CHROMIUM_PATH if using an existing browser installation. No runtime dependency was added to the application.

## Remaining verification

Physical Android/iPhone usability, native photo picker behaviour and fest-scale concurrent load have not been proven by the browser suite. The app needs a real-device smoke test before festival-day operations.
