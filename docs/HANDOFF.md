# SPANDAN 4.0 handoff

Current work: Phase 0 feasibility gate plus Phase 1-3 foundations

## Current state

The repository initially contained planning documents only. It now has a Next.js 16 TypeScript scaffold, a premium public planning-preview home page at `src/app/page.tsx`, and a clear `/account` access explanation; neither claims that registration is live. The requirements baseline and Phase 0 records live in `docs/`. Migrations are `202610140001_phase1_identity.sql` through `202610140005_promotional_content.sql`. No production services were created, no credentials were requested or stored, and no deployment occurred.

## Architecture direction

Use a TypeScript Next.js application with Supabase behind server-only service boundaries. Public reads are sourced from published-safe views; all protected mutations validate current access and staff assignment in database/RPC boundaries. The implemented service worker caches only the public shell/offline fallback and ignores account, admin and API paths; it must never cache private data.

Student login remains batch + roll + password in the UI. A server-side adapter is planned to map the canonical identifier to a private Supabase phone identity; no custom password table or cryptography is permitted. This remains an unverified Phase 0 proof point.

## Immediate next steps

1. Apply all five migrations in a disposable Supabase project and run T01-T17/T20 direct database/API checks, including score conflicts, result corrections, vote retries, private-thread boundaries and draft/scheduled content visibility.
2. Add protected activation, review and selection RPCs with audit records; then connect signup/login and recovery endpoints around the adapter.
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
