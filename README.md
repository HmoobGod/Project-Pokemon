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

**Latest merged: v0.7.3 PR #7 at `1ff42dc9e2591b8234e6de4888ef63aee59a6e39`; v0.7.4 PR #8 is an unmerged source-only candidate awaiting exact-head CI and independent review.** v0.6 was merged following independent review; v0.7 adds preservation of progress made after a restore, explicit quarantine cleanup and recovery-race checks.

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

## v0.7.3 merged — lossless recovery export

Add a read-only export of all six Standard save/recovery slots, preserving corrupt or incompatible raw content without modifying gameplay progress. PR #7 passed exact-head 92/92 source tests, strict TypeScript and independent Claude review (APPROVE / MERGE YES), and was merged to main. See [technical note](docs/LOSSLESS_RECOVERY_EXPORT_V0.7.3.md). No Android APK or gameplay client yet.

## v0.7.4 unmerged candidate — read-only recovery readiness

This preflight classifies the six Standard recovery slots and previews whether an undo/restore is ready, missing, unreadable, safely repeatable, or blocked by a protected slot. It never writes, clears, restores, imports, or exposes raw save content. F3/F4 tests cover observed conditions but do **not** fix the underlying F3/F4 recovery UX or storage behavior. See [technical note](docs/RECOVERY_PREFLIGHT_V0.7.4.md) and [Claude review packet](docs/CLAUDE_REVIEW_V0.7.4.md). Exact-head CI and independent review must pass before any merge; no APK or real gameplay client.
