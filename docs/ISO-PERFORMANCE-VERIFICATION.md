# ISO hotfix and performance verification — 12 November 2026

## Priority hotfix

`67a843c` deployed independently as `dpl_H5VxGPDWwc37vySiUKDvFrJf2hyN` before performance changes. Saved database timestamps with timezone offsets failed Zod's UTC-only datetime validation. All four event times now accept valid explicit offsets and normalize to UTC before comparisons; missing timezone/invalid dates remain rejected. Field-specific messages replace generic ISO errors. The user confirmed Save & Publish succeeded after this release. No database migration was necessary.

## Volleyball poster

Verified the existing event `e800dfbe-511e-41e6-adbf-d9b70bcb6f89`, Doctor Smash League DSL (Volleyball tournament), without replacing its content or creating a duplicate. The event references its own public R2 asset: 132,430-byte WebP, 1086×1448; thumbnail 35,332 bytes, 480×640. Full-image checksum matches the registry. Both variants return HTTP 200 and correct CORS; no EXIF metadata. Catalogue and event-detail HTML contain the direct R2 URL. Downloaded full image visually inspected with correct orientation/readable text. Original media were not deleted.

## Performance changes

- Supabase metadata confirms `ap-south-1` (Mumbai), ACTIVE_HEALTHY. Previous Vercel deployment used `iad1` (USA). Configure the single Hobby-compatible function region `bom1`, not paid multi-region. Sources: [Vercel region configuration](https://vercel.com/docs/functions/configuring-functions/region).
- Removed the installed-PWA splash's artificial 1.4-second blocking timer and unused component/CSS. It previously appeared only in standalone display mode, not ordinary browser mode.
- Session-aware navigation streams separately rather than blocking the entire root layout. Protected page/API checks remain in place. Active-session reads are React request-memoized, never shared between accounts. Home reuses the same session/management checks instead of requesting six parallel profile/permission results plus duplicate layout checks.
- Opt-in anonymous Data Cache: only GET `/rest/v1/events` and `/rest/v1/schedule_entries`, 30-second revalidation, same configured Supabase origin, anon authorization and no cookies. Scores, RPC commands, private reads and writes are excluded. Event saves, attached posters, festival setup and programme live edits expire the tag immediately after success. Fixtures/session statuses remain uncached in the schedule.
- Existing Live Ground ~60-second refresh, five-minute notification cadence, offline score storage and service-worker runtime/RSC exclusions remain unchanged. No subscription or quota change.

## Checks and limits

86 tests passed, including offset-date regressions, cache isolation, real upload-handler tests with mocked boundaries (unauthorized/foreign origin/MIME/size/failing attachment/successful invalidation), and existing image/offline scoring tests. Typecheck/build passed; lint has the same eight pre-existing warnings, zero errors.

Local production-server bounded read test: 20 requests, concurrency 5, zero errors, p50 126 ms/p95 157 ms. This is not a phone benchmark or an unlimited-capacity claim. Production upload/event endpoints reject anonymous writes with 401. No fake registrations/events/votes or destructive tests were used.

Before performance deployment, three sequential public HTTP samples from this workstation (complete HTML response, not browser LCP): events 1265/615/1006 ms; schedule 1043/1128/1023 ms; volleyball detail 1771/1812/1638 ms. Warm/cold/cache/network differences prevent extrapolating these into a guarantee. Anonymous `/home` checks were excluded from this comparison because that route redirects to login rather than exercising the authenticated dashboard.

The user elected to perform visual/mobile checks themselves to reduce tool/token use. Physical-phone LCP, signed-in performance and sustained high-concurrency capacity are not independently verified here. No browser visual pass is claimed.

## Rollback

Rollback the performance deployment to the independently verified ISO hotfix above; do not revert the working timestamp normalization or touch media/database records. Region rollback is `iad1` if necessary, but it reintroduces cross-region latency. Original R2/Supabase media and audit history remain intact.
