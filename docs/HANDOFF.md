# SPANDAN 4.0 handoff

Current work: Phase 0 feasibility gate plus Phase 1-3 foundations

## Current state

The repository initially contained planning documents only. It now has a Next.js 16 TypeScript scaffold, a premium public planning-preview home page at `src/app/page.tsx`, and a clear `/account` page with guarded sign-up/sign-in forms; none claims that registration is live. The requirements baseline and Phase 0 records live in `docs/`. Migrations are `202610140001_phase1_identity.sql` through `202610140008_profile_provisioning.sql`. Login, logout, batch discovery, sign-up, private identity mapping and persistent rate-limit routes compile locally, but remain deliberately disabled until the required Supabase environment is configured. No production services were created, no credentials were requested or stored, and no deployment occurred.

## Architecture direction

Use a TypeScript Next.js application with Supabase behind server-only service boundaries. Public reads are sourced from published-safe views; all protected mutations validate current access and staff assignment in database/RPC boundaries. The implemented service worker caches only the public shell/offline fallback and ignores account, admin and API paths; it must never cache private data.

Student login remains batch + roll + password in the UI. A server-side adapter maps the canonical identifier to a private Supabase phone identity; it uses no custom password table and does not retain the visible identifier in the provider identity. Profile/access provisioning is a server-only, audited RPC. This remains an unverified real-project proof point.

## Immediate next steps

1. Configure a disposable Supabase project with the non-committed environment values, apply all eight migrations, and run T01-T17/T20-T21 direct database/API checks, including authentication cookies, profile provisioning, rate-limit concurrency, score conflicts, result corrections, vote retries, private-thread boundaries, draft/scheduled visibility and cross-event staff isolation.
2. Add the authorised recovery flow, then build the staff UI for activation, review and selection.
3. Build public event catalogue/detail routes from published-only queries once the real event configuration is supplied.
4. Ask the committee only for the unresolved decisions in `DECISIONS.md` that gate real data/publication.

## Production cautions

- Do not deploy sponsor-supported production traffic on Vercel Hobby without written provider confirmation; use Pro or another compliant host.
- Do not publish 2026 dates as final until the committee confirms the edition year.
- Do not publish registrations/results until event rules, points/tie policy, mixed-batch cultural policy and eligible batches are configured.

## Local commands

- `npm run dev` starts the local application.
- `npm run typecheck`, `npm run lint`, and `npm run build` all passed on 14 October 2026.
- `npm test` runs the currently implemented unit checks for the auth identity adapter.
