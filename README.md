# SPANDAN 4.0

Official festival web app for ASMC Firozabad, built with Next.js and Supabase.

## Production deployment

Deploy this repository as a Next.js project on Vercel. Vercel automatically uses `npm run build` and detects the App Router routes.

Add these environment variables in **Vercel → Project → Settings → Environment Variables** for the Production environment:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_IDENTITY_PEPPER=
INITIAL_SETUP_CODE=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=   # optional, only for browser push
```

`SUPABASE_SERVICE_ROLE_KEY`, `AUTH_IDENTITY_PEPPER`, and `INITIAL_SETUP_CODE` are server secrets. Never prefix them with `NEXT_PUBLIC_`, never commit them, and rotate `INITIAL_SETUP_CODE` or remove it from Vercel after first-time setup is completed.

Before going live:

1. Run the Supabase migrations in `supabase/migrations` against the production project.
2. Set the Supabase Auth Site URL to the production Vercel domain and add both the production and preview domains as redirect URLs if email redirects are enabled later.
3. Set the Vercel Function region nearest to the Supabase `ap-south-1` project (Mumbai/India when available).
4. Run `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd test`, and `npm.cmd run build`.
5. Complete `/setup` once, then remove or rotate `INITIAL_SETUP_CODE`.

The app includes baseline security headers, secure production cookies, service-worker offline support, input validation, and route-level auth checks. For the expected ~1,000 registered users and 20–25 RPS, Vercel Hobby and Supabase Free are suitable if usage dashboards are monitored during the fest.
