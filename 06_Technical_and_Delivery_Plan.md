# SPANDAN 4.0 — Technical architecture and delivery plan

Version 1.0 | 14 October 2026

## Architecture and email free authentication

Proposed stack: TypeScript web application, Supabase Postgres/Auth/Storage, server-side API layer and PWA assets. Vercel is the preferred deployment candidate, conditional on permitted use. Keep hosting-specific code small so another suitable host can be selected without rewriting domain logic. Use database migrations, separate development/production configuration and source control from day one.

### Authentication decision requiring a prototype

Supabase documents password authentication with email or phone, not native batch-roll usernames [S1]. Proposed adapter: securely map the batch-roll identifier to a private phone-based Auth identity on the server, then delegate password validation and sessions to Supabase. Do not return the mapped phone or distinguish unknown users from wrong passwords.

Prototype signup with phone/password and provider phone confirmation disabled, while marking the application profile as unverified/pending. This is a proposed integration setting, not proof of phone ownership. All participation stays blocked until treasurer verifies identity and contribution. Test duplicate phones, failed mapping writes, sessions and recovery before committing. If the hosted configuration cannot support this safely without SMS, escalate the auth design; do not invent a custom password database or silently require email.

### Trust and session boundaries

Browser requests reach the server over HTTPS. Passwords are transient inputs, never stored in app tables or logs. Use established session handling with Secure, HttpOnly, SameSite cookies where compatible, CSRF protections and server-side token validation. Do not cache private responses in the service worker. A database check of current access and event role is required for every privileged mutation, even with an older valid session.

Apply persistent account/IP throttling to login and signup, generic responses and an identity-claim recovery route. Administrative recovery issues a random, short-lived, single-use token, stores only its hash, limits attempts and revokes previous sessions after success. Main admin/treasurer must have an additional authenticator factor or equivalently reviewed protection before production. Secrets stay server-side; use least privilege and RLS [S5].

## API boundaries and free tier capacity

| API family | Contract |
| --- | --- |
| Account | Create profile, login, own profile/status, reset-token redemption. Idempotent signup; no public identity lookup. |
| Access and roles | Activate/suspend, assign head, audit query. Main admin/treasurer permissions checked by action. |
| Participation | Apply/withdraw, review, group allocation, roster publication. Server validates active access and assigned event. |
| Competition | Create/reschedule fixture, versioned score update, publish/correct results. Transactions preserve points consistency. |
| Engagement | Vote, feedback, help thread, follow/bookmark, reminders. User-owned records and unique constraints. |
| Content | Published read endpoints; role-restricted draft/edit/publish. Pagination, compression and cache headers. |

Use request IDs, explicit validation errors, generic auth failures, 409 conflicts for stale/duplicate state and idempotency keys for retry-prone mutations. Audit privileged requests without recording passwords or tokens.

### Capacity snapshot checked 14 October 2026

Supabase Free lists 500 MB database, 1 GB file storage, 5 GB uncached plus 5 GB cached egress, 50,000 monthly active users, 200 peak Realtime connections and 2 million monthly Realtime messages. Automatic backups are not included and inactive projects may pause after one week [S2]. Limits can change; verify in the actual account before launch.

Planning estimate, not measurement: 1,000 users x 10 applications yields about 10,000 applications. Metadata is likely modest; media and score traffic dominate. For 300 spectators polling every 15 seconds over 4 hours, there are 288,000 requests. At 5 KB per response that is about 1.44 GB payload before overhead. Cache a public score snapshot; pause refresh in background tabs and return only changed/minimal data. Do not attach 1,000 persistent Realtime clients to a 200-connection allowance.

Use compressed thumbnails and external video/audio hosting. Proposed media budget 250 MB initially; alert at 60/80 percent of relevant quotas. Export data daily and test restore; private backups must be encrypted and access-controlled. Never count a participant CSV as a complete system backup.

### Hosting decision gate

Vercel Hobby is restricted to personal, non-commercial use [S3,S4]. Sponsor promotion and fest contribution context mean eligibility must be resolved before public production; absence of checkout alone does not establish eligibility. Obtain provider clarification or choose suitable hosting. A zero-cost production outcome is a goal, not a promise.

## Twenty one day execution plan

Planning anchor: 14 October 2026. Requested launch window: 28 October to 4 November. The 21-day plan ends 3 November with 4 November as launch buffer. All selected modules are included; estimates assume sustained daily development and prompt committee input.

| Days | Deliverable and exit gate |
| --- | --- |
| 1 to 2 | Auth adapter and hosting decision; roles/schema; prove signup, pending access, activation, protected write and recovery |
| 3 to 5 | Public event pages, profile, applications, event-head queue; test duplicates and cross-event permissions |
| 6 to 8 | Selection/groups/captains, fixtures, sport score templates, result publishing and points correction |
| 9 to 11 | Personal schedule, reminders, notices, polls, feedback and private help threads |
| 12 to 14 | Sponsors, stage reveals, gallery/media, organiser profiles, merchandise and share cards |
| 15 to 16 | PWA, accessibility, mobile polish, real content and staff training draft |
| 17 to 18 | Functional/access tests, realistic traffic runs, cache/quotas and backup restore |
| 19 to 20 | Multi-batch pilot, head/treasurer rehearsal and fixes; no scope expansion |
| 21 | Production smoke test, rollback readiness, final approval and launch |

### Operational preparation after app launch

Before 17 November: every sport has a named score operator, published rules, approved squads, fixtures and tested score template. Before 21 November: cultural groups, stage programme, artists/media permissions and help coverage are confirmed. After 26 November: publish final standings and feedback, reconcile disputes, export records and apply the retention plan.

### Development method

Build one feature vertically through database, server, UI and acceptance checks before moving on. Commit small reviewed changes. Give AI tools the relevant requirement IDs and forbid role checks based only on client state. Keep credentials outside prompts and repositories. Maintain a defect list; never use generated sample data in live participant records.

### Risks and escalation

Critical risks are an unproven auth adapter, unsuitable hosting, late event rules, free-tier traffic ceilings, absent score operators and no tested recovery. A failed critical gate means not ready. Fixed scope and deadline do not justify insecure authentication or untested activation. Present the blocker with resource/date/budget options to the organiser rather than quietly reducing scope.
