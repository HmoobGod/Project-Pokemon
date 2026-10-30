# Project Pokemon v0.6 — review-preserving recovery and pending run lifecycle

**Target:** offline earned progression source prototype. **No playable APK or original game-client code.**

## Motivation

The independent v0.5 review approved PR #2 for source-only merge and identified three pre-integration risks:

- **V5-1 / N19:** a profile produced by an older version can be rejected by new validation (e.g. 129 pending tickets), then overwritten by recovery without preserving its bytes.
- **V5-2:** pending-run cap at 128 without an abandon/expiry action could strand the user.
- **V5-3:** imported pending tickets for locked maps bypassed catalog validation.

## Changes

1. `recoverCorruptPrimary()` validates the backup *before* touching the primary. If the existing primary is not valid under current rules, it is copied verbatim to `pokebonk.standard.profile.quarantine.v1` before the fallback is written. A different existing quarantine blocks repeated recovery. A failed quarantine write or failed backup validation does not mutate the primary. The raw rejected profile can be exported using `exportQuarantinedPrimary()`. Valid primary, unsupported schema and version still refuse recovery.
2. `abandonRun(ticketId)` is a manual, no-reward way to consume a pending ticket permanently. It removes the ticket and records its ID in `processedRuns` (which now means **consumed run IDs**, whether completed or abandoned). It does not increment runs/wins, grant Stardust, change sightings, or unlock maps. It uses the same storage validation and stale-writer protection as other mutations. This enables progression past the defensive 128-ticket cap without fake run rewards.
3. Saved pending tickets are rejected if the referenced map's prerequisite has not been won. A no-starter profile may no longer claim map wins. Legitimately initiated tickets are unaffected.
4. Twelve new tests cover the above behaviors, including corrupted JSON, older readable ticket overflow, quota failure, quarantine conflict, import without writes, and unrecognized schema protection.

## Verification

- Node.js 22.16.0: **70/70 local tests passed**.
- TypeScript 5.8.3 strict typechecking: **passed**.
- GitHub Actions exact-head CI: **must be verified for the PR commit**.
- Independent Claude source review: **required before merge**.

## Remaining pre-UI/integration risks

- **N18**: `restorePreRestore()` is explicit but may discard gameplay performed after a restore. A swap-style undo or explicit informed confirmation is needed before user-facing UI.
- **N19**: missing/future schema and incompatible-version primary recovery still refuse automatic overwrite. Provide user-facing export/discard/migration paths without silent destructive resets.
- This localStorage layer cannot provide cross-tab compare-and-swap or device-cloud consistency. Manual exports remain necessary.
- No official server reward formulas, League entitlement grants, map restrictions, or game client integration have been confirmed. Reward policy remains a synthetic test dependency.
- The underlying game/assets cannot be redistributed without appropriate rights.

## Reviewer focus

- Confirm an older but readable save newly rejected by strict validation is preserved byte-for-byte through recovery.
- Confirm quarantine slot cannot be clobbered by another recovery or ordinary gameplay.
- Verify missing/invalid backup and write failures leave primary unchanged.
- Verify no-reward abandon cannot be converted into credited finishes or replayed tickets.
- Verify locked pending maps and no-starter victories are rejected before mutation.
- Identify any new data-loss or save-version backward-compatibility issues.
