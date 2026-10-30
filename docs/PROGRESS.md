# Project Pokemon — development progress

**As of:** October 30, 2026 · v0.7 source candidate

```text
Overall APK          ███░░░░░░░░░░░░░░░░░  14% (estimate)
Source & CI          █████████████░░░░░░░  65% (candidate awaiting review)
Progression engine   ███████████░░░░░░░░░  55% (synthetic test core)
Client rules         ██████░░░░░░░░░░░░░░  30% (client metadata only)
Gameplay integration ░░░░░░░░░░░░░░░░░░░░   0%
Android APK          ░░░░░░░░░░░░░░░░░░░░   0%
Device testing       ░░░░░░░░░░░░░░░░░░░░   0%
Permissions          ░░░░░░░░░░░░░░░░░░░░   0%
```

## Latest
- v0.6: Claude approved with conditions and PR #3 was squash-merged to main at `8f03b2555f71f3ef9ac58f8c4d7536b676e8ae3f` after both exact-head CI runs passed. 70 local tests passed.
- v0.7 candidate: durable pre-undo progress, reversible `restorePreUndo()`, guarded quarantine clear and concurrent recovery cleanup. Nine additional source tests target these changes.
- Merge remains gated by exact-head CI and an independent Claude review.

## Open pre-UI issues
- Design real migration/discard/export for incompatible source versions and schemas.
- Manage unbounded `processedRuns` without ever reusing run IDs.
- Clarify all user-facing restoration/discard confirmations and storage quota handling.
- Validate original server rewards, League entitlements, original client and content permissions.

No playable Android APK exists. These are engineering estimates, not measured functional completion.

## v0.7.1 hotfix candidate — October 30, 2026

- v0.7 PR #4 passed 79/79 CI tests and was independently approved by Claude, then squash-merged to main at `a7a5d3fc122108671843cf69d184d4e693df10b4`.
- Claude F1/F2 from v0.7: add static quarantine clear reachable during corrupt primary and stop race cleanup deleting the only copy of rejected bytes.
- Five new regression tests; new exact-head CI and independent Claude delta review required before merge.
- F3/F4 recovery UX, processed-run growth and migration remain pre-UI blockers.
- Overall APK estimate **14%**; no playable Android integration has been completed.


## v0.7.2 missing-primary recovery race fix (October 30, 2026)
- Claude APPROVE WITH CONDITIONS for v0.7.1 and PR #5 merged at `328eab8bd9dfc4f5d89261ffcacbd9c4b86dc277` (84/84 CI tests).
- Fix N1: avoid overwriting newer primary when initial primary was missing and another tab saves during recovery.
- Four new tests; exact-head GitHub CI and Claude delta review required before merge.
- No increase to overall 14% estimated APK progress; no playable UI/Android implementation.

## v0.7.3 stacked read-only emergency export candidate — October 30, 2026
- Work is stacked on v0.7.2 PR #6; neither is merged at time of authoring.
- Add raw export/structural validation for six recovery slots, including incompatible/corrupt bytes, without mutating any saved gameplay state.
- New source regression tests; exact-head CI and independent review remain required before merging.
- Overall APK estimate remains 14%; gameplay/Android/device tests still 0%.
