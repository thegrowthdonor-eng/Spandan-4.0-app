# Visual QA checklist

Run `npm run qa:seed`, `npm run qa:verify`, and `npm run dev:qa`. Do not use plain `npm run dev` for this checklist: that command continues to use the production `.env.local` environment.

- Guest: home/guest, all 34 events, posters, rules, open/closed/ongoing/completed/cancelled states, notices, banners, sponsors, gallery, stage reveal, committee and merchandise.
- Participant: sign in with active `MBBS 2021 / 1`; My Fest contains five applications covering approved, waitlisted, rejected, selected, reserve and unselected states, plus a reminder, poll vote, feedback and help thread.
- Account states: confirm `MBBS 2021 / 97`, `/ 98`, and `/ 99` show the pending, rejected and suspended experiences without gaining active-participant access.
- Organisers: inspect the main-admin, treasurer, event-head, coordinator and notice-publisher views using the account sheet printed by the seed command.
- Schedule: confirm each 1–8 Dec day separates Programme from competitive Fixtures, and solo/stage programme rows never say “vs”.
- Feed and Live: confirm 12 fixtures cover live, paused, final and scheduled variations from score snapshots; check the radar and notification bell.
- Results and standings: confirm 10 published result cards with podium photography, non-zero points and all six batch standings appear.
- Gallery and content density: confirm nine gallery cards, two stage reveals, four banners, four sponsors, six committee profiles and five merchandise cards render with their QA images.
- Responsive pass: check guest, events, Schedule, Feed, Live, Results, Gallery, Sponsors, Merchandise, Committee, My Fest and admin pages at phone, tablet and desktop widths.

All names, accounts, notices, sponsors and inventory in this project are fictional QA data. Do not use it for real festival operations.
