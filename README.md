# Project Pokemon — Offline earned-progression research

A **source-only, experimental** Android-game adaptation research project. No original game client/assets or playable APK are bundled.

## Progress estimates

```text
Overall APK           ███░░░░░░░░░░░░░░░░░  14%
Source and CI         █████████████░░░░░░░  65%
Progression engine    ███████████░░░░░░░░░  55%
Original client rules ██████░░░░░░░░░░░░░░  30%
Gameplay / Android    ░░░░░░░░░░░░░░░░░░░░   0%
```

**Latest merged: v0.7.2 PR #6 at `7331f4efbfa932c398b57b5024a318aad661f374`; v0.7.3 PR #7 is an unmerged source-only candidate awaiting independent review.** v0.6 was merged following independent review; v0.7 adds preservation of progress made after a restore, explicit quarantine cleanup and recovery-race checks.

See [full progress](docs/PROGRESS.md), [v0.7 technical details](docs/SAVE_RECOVERY_V0.7.md), and [Claude review request](docs/CLAUDE_REVIEW_V0.7.md).

## Run tests

Requires Node.js 22.16+ and TypeScript 5.8.3 (CLI on path).

```bash
npm run test
npm run typecheck
```

No official game backend, authentic server reward formulas or League entitlement grants have been implemented. No Android app or gameplay rendering has been built.

## Original content and rights

This repository contains original prototype code, synthetic fixtures, factual client metadata and notes. Original PokéBonk game code, Pokémon art/assets, sounds and bundles are **excluded**. Public availability is not authorization to redistribute game assets. Rights/permissions must be reviewed before distributing any original game content. Unofficial and unaffiliated.

## v0.7.1 safety patch (merged)

This patch addresses Claude's **F1** (quarantine clear unreachable during a corrupt primary) and **F2** (concurrent recovery deleting the only raw rescue copy). See [technical note](docs/QUARANTINE_HOTFIX_V0.7.1.md) and [review request](docs/CLAUDE_REVIEW_V0.7.1.md). Requires exact-head CI and Claude review before merge.


## v0.7.2 merged — missing-primary race guard

Claude's v0.7.1 review identified a race where recovery of an absent primary could replace a newly written valid save. The new final primary check fails closed. See [technical notes](docs/RECOVERY_RACE_V0.7.2.md) and [review packet](docs/CLAUDE_REVIEW_V0.7.2.md). Exact-head CI and Claude independent review passed; PR #6 is merged into main.

## v0.7.3 candidate — lossless recovery export

Add a read-only export of all six Standard save/recovery slots, preserving corrupt or incompatible raw content without modifying gameplay progress. This branch is rebased onto the merged v0.7.2 main; PR #7 awaits exact-head CI and Claude review. See [technical note](docs/LOSSLESS_RECOVERY_EXPORT_V0.7.3.md). No Android APK or gameplay client yet.
