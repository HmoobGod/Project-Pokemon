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

**Current source candidate: v0.7.1.** v0.6 was merged following independent review; v0.7 adds preservation of progress made after a restore, explicit quarantine cleanup and recovery-race checks.

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

## v0.7.1 safety patch (candidate)

This patch addresses Claude's **F1** (quarantine clear unreachable during a corrupt primary) and **F2** (concurrent recovery deleting the only raw rescue copy). See [technical note](docs/QUARANTINE_HOTFIX_V0.7.1.md) and [review request](docs/CLAUDE_REVIEW_V0.7.1.md). Requires exact-head CI and Claude review before merge.
