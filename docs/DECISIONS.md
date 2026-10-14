# SPANDAN 4.0 decision register

Last updated: 14 October 2026 (Asia/Kolkata)

## Confirmed requirements

- College-only PWA for GMC Firozabad; public published event information and activated-student registration.
- Student identity uses batch, roll number, name, phone and password. No paid SMS OTP, student-email requirement, payment, checkout, wallet, QR attendance/gate entry/login, open chat or livestream.
- Treasurer/main admin alone verify the off-app contribution and control activation. Heads have event-scoped operations only; captain is a participant tag.
- Students apply individually. Application review and final selection are independent. Sports squads are batch-wise; only published final positions affect standings.
- Content is editable by authorised dashboards, including scheduled publish state and banner order/visibility where applicable.
- In-app reminders are required; browser push is optional/best effort. AI is advisory and may not make protected or outcome-changing decisions.

## Proposed defaults adopted for development

| Decision | Rationale | Reversible? |
| --- | --- | --- |
| Next.js App Router + TypeScript + Supabase Postgres/Auth/Storage | Maintains a small deployable web application with server-side mutation boundaries. | Yes, database domain remains provider-neutral. |
| Batch-roll adapter maps only on the server to a private Supabase phone identity | Supabase password auth documents email/phone identifiers, not arbitrary usernames. Keeps the student login UI email-free and does not implement password cryptography. | Yes, pending prototype. |
| Public score views poll only while visible; no mass persistent Realtime subscriptions | Better fits a 500-1,000 user festival and free-tier connection limits. | Yes. |
| English UI, Asia/Kolkata presentation, UTC storage | Matches documents and avoids ambiguous event time. | Yes. |
| Waitlists, configurable windows/capacities, withdrawal before roster lock, clash warnings | Explicitly marked proposed in the supplied requirements. | Yes. |

## Material feasibility findings

- On 14 October 2026, Supabase's password documentation states password identity is email or phone. Phone/password can be enabled and phone confirmation is configurable, but Supabase cautions that phone-number reuse is a risk and recommends MFA. We will not claim the adapter is production-ready until it succeeds against a real Supabase project with generic failures, session handling, duplicate protection and recovery tests.
- Vercel's current Hobby documentation says it is for personal, non-commercial use. A sponsor-supported festival should use Vercel Pro or another provider with written eligibility confirmation. This is a production-hosting blocker, not a local-development blocker.
- Supabase Free currently lists 50,000 MAU, 500 MB database, 1 GB storage, 5 GB egress plus 5 GB cached egress, and pauses after one inactive week. It may work for development/pilot, but media and public score traffic need monitoring and an export/restore plan.

## Unresolved decisions

| Decision | Owner | Required before |
| --- | --- | --- |
| Official edition year, college name, organising line, batches/courses and roll canonicalisation | Committee | Profile configuration/public dates |
| Event list, capacities, formats, windows, venues, heads and rules | Event heads | Publishing/opening registration |
| Contribution evidence and allowed reference | Treasurer | Activation opens |
| Points, ties, shared places, disqualification and mixed-batch cultural policy | Committee | Publishing counted results/selection rules |
| Final assets, consent/contact visibility and retention period | Committee | Public launch |
| AI provider, budget, rate limits and spending cap | Committee | Phase 6 production enablement |
| Production hosting provider/account owner | Committee | Public production deployment |

## Explicit exclusions

Online payment or refunds; QR attendance/gate/login; student email requirement; anonymous/open chat; livestream production; automated commentary; cart/reservations/checkout; intercollege accommodation; student media uploads; certificates, map, volunteering, treasure hunts and deeper analytics at launch.
