# v0.7.4 — Read-only recovery readiness (source-only)

**Status:** unmerged PR #8 engineering candidate rebased onto v0.7.3 main `1ff42dc9e2591b8234e6de4888ef63aee59a6e39`; not a playable Android APK.

## Dependency and scope
PR #6 and PR #7 have passed independent review and merged in order. PR #8 is rebased directly on their newest main; it must pass **new exact-head CI and independent Claude review** before merge, and may not use the obsolete old stacked-head tests as merger approval.

A Standard profile can contain healthy progress alongside several durable recovery slots. The recovery mutators deliberately fail closed when an undo slot would be overwritten. A failed primary write while undoing can leave an intentional, protective pre-undo stash. A subsequent restore after gameplay may also hit a pre-restore conflict (Claude F3/F4). The current code has no read-only way to display these safeguards before the user attempts a restore.

## API
`assessRecoveryReadiness(storage,catalog)` returns six slot classifications (`missing`, `valid`, `unreadable`) plus four restore previews (backup, pre-import, pre-restore, pre-undo):
- `ready`: source and current primary validate; target slot can be applied subject to all live guards and quota checks.
- `retry-with-preserved-pre-undo`: existing pre-undo snapshot equals current primary, so the attempt can be retried without discarding the stash.
- `no-op`: target equals primary raw bytes.
- `missing-target` / `unreadable-target`: do not attempt restore.
- `unavailable-primary`: a corrupt or missing primary requires a separate safe recovery workflow; constructing the ordinary progression instance cannot proceed.
- `protected-slot-conflict`: an independent recovery snapshot would be overwritten. Export, retain, or resolve deliberately before retrying; never silently clear it.

The preview returns no raw values, uses the v0.7.3 six-slot double-read exporter, and makes no write, delete, import, restore, earned-progression change or edition crossover. It is advice, NOT an atomic multi-tab lock; actual mutators still perform their own checks. It cannot distinguish a failed attempt from a preexisting identical stash with certainty, hence the retry label describes storage state only.

## Regression tests
- F3 simulated primary quota failure: primary remains unchanged; pre-undo copy remains durable; read-only preview indicates retry; a later retry succeeds.
- F4 post-undo gameplay: protected pre-restore snapshot blocks destructive redo; no data is discarded.
- Pure/no-write inspection and different-edition isolation.
- No-op precedence, missing/unreadable or future schema target and corrupt primary refusal.
- Observed concurrent mutation fails closed instead of returning a potentially stale preview.

## Still pending
This is no UI or user-confirmation implementation; it does not automatically repair F3/F4, choose which conflicting snapshot to discard, or guarantee atomic localStorage transactions. Processed-run growth, source-version migration, authentic gameplay/client assets, upstream rewards and entitlements, legally authorized distribution, Android build and device tests remain open.
