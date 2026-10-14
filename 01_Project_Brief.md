# SPANDAN 4.0 — Project brief and scope

Version 1.0 | 14 October 2026

## Confirmed project baseline

SPANDAN 4.0 is a mobile-first, installable festival web app for GMC Firozabad. This brief records the organising student's decisions and separates them from implementation recommendations. It is intended for the committee, Himanshu Sharma as the developer, and the AI tools assisting development.

| Item | Confirmed baseline |
| --- | --- |
| Audience | GMC Firozabad students only; approximately 500 to 1,000 users |
| Programme | Approximately 31 to 50 sports and cultural events |
| Dates | Sports start 17 November; main fest 21 to 26 November. Year 2026 is a planning assumption requiring confirmation. |
| Launch | All selected features within 2 to 3 weeks; 28 October to 4 November 2026 if work begins 14 October |
| Delivery | PWA built from scratch by the organiser with AI assistance |
| Budget | Free-tier-first; Supabase and Vercel preferred, subject to capacity and permitted-use checks |
| Access | Public event information; event registration only for activated students |
| Contribution | One common fest contribution collected outside the app; no payment gateway |
| Login | Batch, roll number and password; no student email requirement or paid OTP dependency |

### Participation model

Students create a profile containing name, batch, roll number and phone. Main admin or treasurer verifies college identity and contribution before activating access. Students apply individually to events. Each sport and each cultural event has its own assigned head, who approves applications and directly selects squads, pairs or groups. Sports teams are batch-specific; the head assigns the captain tag. There is no overall event participation cap, but individual event rules apply.

Application approval is not the same as final selection. This distinction must appear in the interface. Only final competition positions contribute to the overall batch leaderboard; exact points remain undecided. QR-based login, gate entry and attendance were discussed and then removed from the scope. A public QR may simply open the app.

## Delivery scope and decision register

### Included in the launch

Event catalogue and details; registration and selection; treasurer activation; event-head administration; fixtures and published results; sport-specific live scores; batch leaderboard; personal schedule and reminders; announcements; audience polls; feedback; sponsors and partner pages; social links; share cards; curated photo/video gallery; Main Stage and artist reveals; FAQs and organiser queries; committee profiles; teaser, anthem and aftermovie sections; merchandise showcase without checkout.

### Boundaries

No online payment, wallet, fee collection, ticket checkout or refunds workflow. No student email login, open chat, anonymous confessions, livestream production, automated ball-by-ball commentary, marketplace or intercollege accommodation system. Certificates, treasure hunts, student media uploads, venue maps, volunteer recruitment and additional analytics are future possibilities, not launch commitments. Unreleased media and unannounced artists must have honest empty states.

### Proposed defaults rather than confirmed decisions

English interface; responsive desktop admin; configurable registration windows and capacities; waitlist support; editing and withdrawal before roster lock; clash warnings rather than blanket blocking; in-app reminders with optional browser notifications and calendar export; moderated content; manual head-entered score snapshots; head-published final results with audit history. These defaults can change through the decision register without changing confirmed requirements.

| Pending item | Owner and latest decision point |
| --- | --- |
| Official college name, eligible batches/courses, organising line, year | Committee; before profile configuration |
| Event list, formats, capacity, deadlines, venues and head assignments | Event heads; before event publishing |
| Contribution amount and acceptable verification evidence | Treasurer; before activation opens |
| Points, ties, shared places, disqualifications and mixed-batch cultural rules | Committee; before registrations open |
| Auth adapter proof and production hosting eligibility | Developer; first two build days |
| Final brand assets, consent wording and retention period | Committee; before public launch |

The requested deadline is a constraint, not evidence that the build is feasible. All features remain in scope. If a gate fails, report the specific blocker and seek a decision on resources, budget or date; do not silently drop features or bypass access checks.
