# Project Pokemon v0.7.1 — Recovery race hotfix (Claude F1/F2)

**Source-only research milestone.** Not a playable APK, game client adaptation or proof of official economy parity.

## Fixed
- **F1:** `StandardProgression.clearQuarantine(storage, expectedRaw, expectedPrimary)` is now a static recovery utility that works even if constructing an instance fails on a corrupted primary. It checks the exact quarantine bytes and caller-observed primary bytes before deleting. A loaded instance still offers `clearQuarantine(expectedRaw)` which delegates with its last-known primary value.
- **F2:** `recoverCorruptPrimary()` never deletes a quarantine after an observed race. Two tabs might rely on an identical quarantined raw snapshot as their last rescue copy. It leaves the raw data intact even if the first recovery is aborted. A redundant quarantine is handled explicitly with the static clear API, not by unsafe automated cleanup.

## Tests
Five adversarial regression tests: second corruption deadlock; stale observed primary rejection; competing recoveries and unique rescue preservation; foreign-write race; no interference with separate Unlocked edition keys.

## Tradeoffs
- A failed recovery can leave an otherwise stale quarantine. This is intentional: preserving raw bytes wins over automatic cleanup without a transactional ownership token.
- Deleting a quarantine is **irreversible**. A future UI must export the raw content to a file, explain its risk, and require deliberate confirmation before invoking the static method.
- LocalStorage lacks compare-and-swap, so the final read/remove race cannot be eliminated at this layer.
- Claude **F3** failed pre-undo stash on failed primary write, **F4** restore-preUndo conflict and unbounded processedRuns remain tracked pre-UI issues.
- Original Stardust rewards, League unlock claims, save migrations, original game assets/permissions, playable Android APK and physical device tests are not implemented.

**Review required** for this exact commit; do not merge until CI and Claude approve.
