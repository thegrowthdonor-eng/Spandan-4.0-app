# R2 media rollout — 12 November 2026

## Configuration

- App remains `https://spandan-4-app.vercel.app`; Auraserve remains on Vercel.
- User approved GoDaddy delegation to `carlos.ns.cloudflare.com` and `jean.ns.cloudflare.com`. Both public resolvers returned this pair. The five original portable DNS records were preserved; website CNAME/A records remain DNS-only.
- Approved public images: R2 Standard `spandan-media`, custom domain `https://media.auraserve.in`, minimum TLS 1.2. `r2.dev` stays disabled.
- Unapproved uploads: R2 Standard `spandan-media-private`, no public domain or development URL.
- CORS allows only `https://spandan-4-app.vercel.app`. Public bucket: GET/HEAD. Private: signed GET/HEAD/PUT, content-type/checksum headers. CORS does not authorize uploads; signatures and app/database permissions remain required.
- R2 environment values are server-side Vercel Production secrets. Local operational credentials are in ignored `.env.r2.local`; migration commands load both `.env.local` and `.env.r2.local`. Never commit either file. The separate local file does not automatically enable the Next development server.

## Verified

- Both bucket credentials work without bucket-administration permissions. CORS was configured through the authenticated dashboard, not by expanding the key.
- Signed upload and authenticated read pass; unsigned private access is denied. Expired signed upload returns 403. Allowed-origin preflight returns 204; unrelated origin returns 403 without an allow-origin header.
- Actual application helpers pass private upload, image validation, short-lived private review, approved publication, admin upload and soft archival. Two inert verification registry records remain archived; test objects are retained, not referenced by events or entries.
- Public HTTPS delivery returns matching SHA-256 and immutable cache headers. Repeated GET of the smoke image returned Cloudflare HIT. Images use direct R2 URLs; static app assets were not moved.
- Production discovery found one referenced `fest-media` image. It was copied, verified by checksum/dimensions and visually inspected, then its event poster reference switched. Original remains accessible. No other external URLs, unreferenced objects or static assets were silently migrated.
- Migration/rollback manifest: `audit-artifacts/r2-media-manifest.json`. The working resumable manifest also remains under ignored `scratch/`.
- Unit tests: 78 passed; typecheck and production build passed. Lint: 0 errors, 8 pre-existing warnings (six frontend warnings and two unused variables); no unrelated warning cleanup included.

## Rollback

Production deployment `dpl_HspKHyAHjDrqZMqrbSH9tAoBonh3` reached READY and retained alias `https://spandan-4-app.vercel.app`. GitHub feature branch checkpoint: `39d6787`. Post-cutover events HTML references the direct R2 image, not Vercel image optimisation. Auraserve and Spandan returned HTTP 200 after delegation/cutover.

1. Set Vercel Production `MEDIA_PROVIDER=supabase` and redeploy the previous tested application release. Retain R2 credentials and objects for investigation.
2. Restore references using the saved manifest, existing `scripts/migrate-media.ts rollback`, both local environment files, and project-scoped `MEDIA_REFERENCE_APPROVAL=uytvtmkapusjjqhjyopd`. Review concurrent-edit failures; do not force overwrite.
3. Original storage URLs and objects remain intact. Do not delete media, ballots, scores or audit records as part of rollback.
4. DNS rollback, only if required and approved: previous GoDaddy nameservers were `ns53.domaincontrol.com` and `ns54.domaincontrol.com`; caches make reversal non-instantaneous. Keep both zones intact. A media-only app rollback normally needs no DNS rollback.

## Remaining verification limits

No fabricated student entries or live votes were created in production. Full participant/coordinator browser workflows on a physical phone, high-concurrency load and provider quota headroom are not verified by these bounded storage tests. R2 is usage-billed beyond free allowances; this is not an unlimited-free-traffic guarantee. No paid add-on or original-media cleanup was performed.
