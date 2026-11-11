# Simplified operations and student-first schedule

This revision supersedes the heat/flight/session UI described in the earlier competition delivery documents. Development remains on `feature/competition-voting-r2`; schema changes have been applied only to isolated QA. R2 credentials will be provisioned later by the owner.

## Event policy

| Saved method | Workflow |
|---|---|
| `live_matches` | Approved sports fixtures, explicit IST-day Start & Score, offline scorer and final award publication |
| `fixtures_only` | Chess/carrom pairings and timing; no scoring, Start or clock; manual final awards |
| `results_only` | Approved winners, award positions, optional final value and publication; no session prerequisite |
| `voting` | Image or written submissions, moderation, account voting, runoff, verification, locked winners and publication |
| `programme` | Event information, existing registration where enabled, and gallery updates; no new official results |

Participation format is independent. The event builder saves its method/entry format/value unit atomically with event details. Dependencies lock incompatible changes; changing a title does not change the saved method. Default suggestions are Football/Cricket/Basketball-specific scoreboards, points/sets for Badminton/Table Tennis/Volleyball/Throwball, games/sets for Lawn Tennis, score/round controls for other approved team sports. Local tournament rules remain organiser-controlled; no automatic pairing or tennis rally-point engine was added.

Manual results retain the existing award and batch-points workflow, with optional `finalValue` and an event unit (`seconds`, `minutes`, `metres`, `count`, `marks`). Public results carry `final_value`/`value_unit`; notes and historical identity fields remain compatible. Publication now supplies `expectedVersion` (zero initially). A stale version fails with HTTP 409 instead of overwriting a correction. New winners start blank; voting winners come from verified rankings and cannot be substituted.

Written submissions reuse the existing entry description (10,000 characters) and preserve paragraphs as escaped text. Text is required for a written entry; its image is optional. Image entries still require validated media. Optional images use the existing ownership/private approval checks. No PDF, audio or video hosting was added. Image-backed end-to-end verification remains gated by real R2 staging.

## Reviewed existing-event mapping

Read-only production inspection on 11 November 2026 found two event records; neither had fixtures or result publications. No production schema/data was changed.

| Existing production event | Proposed method | Note |
|---|---|---|
| Inter Batch 7v7 Football tournament | `live_matches` | Existing football template retained |
| Through my lens- Photography competition | `voting` | Image entry; submission/voting windows and R2 readiness must be configured before launch |

QA additionally contains representative badminton/table-tennis/team sports, chess/carrom, athletics, arts/literary and stage fixtures. Its historical 100m fixtures/scores are preserved but excluded from new live operations. Existing Poetry Slam and Solo Singing publications are preserved, including their ledger history; new stage publications are blocked. No historical points were removed. Existing photography/rangoli records without publications receive the reviewed voting default; existing vote-configured events retain voting. Other existing creative/literary events retain manual results unless explicitly configured otherwise.

Before production rollout, repeat the read-only mapping against current records and review any new historical conflicts. Apply the earlier additive feature migrations first, then the three `simplified_*` migrations in timestamp order. No reference/media cutover or original-media cleanup is included.

## Student schedule

The agenda is immediately visible with a compact date strip, search and relevant category chips. The initial IST day follows the approved festival/first-last-published rules. Date/category/search use the native history API integrated with Next navigation; editing filters does not refetch the server or database. Timed items are chronological and unknown timings are separate. All categories render, including competition/unknown fallbacks; status comes from saved state rather than elapsed time. Missing venue/time and partial failures are shown per item/page as appropriate.

Reproduce the dedicated schedule checks with `npm run qa:schedule` against the isolated production-mode QA server on port 3002. It needs the same existing Playwright module/Chromium environment configuration as `qa:competition:browser`, creates only tracked fictional programme rows and removes them afterwards. It does not log into real student accounts or touch production.

Existing programme, registered-event and permitted fixture sources are retained. No title-based merging is performed. Advanced session projections are archived; their stored records/audit history are retained. Public Live Ground reads only scored fixtures plus existing programme updates, keeps the 60-second shared cache and local clocks, and no longer makes the retired advanced-session query.

## Rollback and compatibility

Rollback must be coordinated with the database changes. Do not blindly restore the previous application deployment: the revised publication RPC requires a version for corrections, non-digital scoring is blocked, and advanced session writes are retired. Prefer a forward fix or keep a maintenance window while restoring a reviewed compatible deployment/RPC surface. Retain all ballots, score checkpoints, result versions and audit records. Destructive schema rollback is not part of this release.

Empty settings rows follow an explicitly authorised event deletion; existing sessions, entries and other historical dependencies still prevent deletion. This avoids blocking deletion of a newly created empty draft solely because its method settings were initialised.

Production deployment, paid activation, R2 provisioning/cutover and original-media deletion have not been performed.
