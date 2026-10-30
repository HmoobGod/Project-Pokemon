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
