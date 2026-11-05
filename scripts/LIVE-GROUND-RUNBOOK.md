# Live Ground festival runbook

## Before the festival

- Open the Supabase dashboard during festival week and verify the Free project is active (inactive Free projects can pause).
- Apply `supabase/migrations/20261105120000_offline_live_ground.sql`, then confirm `/api/public/live` returns `200` with a payload below 8 KB.
- In **Organiser Hub → Central Live Desk**, fill every programme's exact start time and venue. Untimed entries cannot be started live.
- Assign each sports fixture, open **Prepare Offline Scorer** on its one designated device, install the PWA, and accept persistent storage.
- On each device, enable airplane mode, reload `/scorer`, make and undo a test score, then reconnect and confirm **Synced to Live Ground**.
- Download one recovery file per prepared fixture and keep a paper score sheet available.

## During the festival

- Keep the designated device with the coordinator. Do not clear browser/site data or transfer the lease while it has a queued checkpoint.
- Treat **Saved on this device** as local-only. Spectators see the update only after **Synced to Live Ground** appears.
- For cricket, compare the provisional score with CricHeroes and use **Reconciled & publish** with the official HTTPS scorecard link.
- Use Central Live Desk for non-match Start, Pause, Complete and Cancel actions.
- If a device is lost, a main admin must release/force-transfer its lease; export the old device queue if it becomes available.

## Free-tier guardrails

- Do not enable Supabase Realtime for Live Ground. Public clients poll only while visible: 45 seconds when live, 2 minutes otherwise.
- Watch Central Live Desk diagnostics for snapshot count, payload storage and active scorer leases. If traffic is unexpectedly high, increase the public polling interval before changing plans.
- Download the main-admin JSON backup after each festival day. This deployment does not assume paid database backups.
