# Project Pokemon — offline progression research

A **source-only, experimental** Android game-port research project targeting an *earned-progression* experience. The immediate milestone is a tested, isolated local progression core. **There is no playable APK here yet.**

## Progress dashboard (estimated)

```text
Overall APK completion   ██░░░░░░░░░░░░░░░░░░  12%
Source / CI              ███████████░░░░░░░░░  55%
Progression engine       ███████░░░░░░░░░░░░░  35%
Original client rules    ██████░░░░░░░░░░░░░░  30%
Gameplay integration     ░░░░░░░░░░░░░░░░░░░░   0%
Android build            ░░░░░░░░░░░░░░░░░░░░   0%
Device tests             ░░░░░░░░░░░░░░░░░░░░   0%
Rights clearance         ░░░░░░░░░░░░░░░░░░░░   0%
```

Rough engineering estimates, not verified APK completion. **v0.3 source: 24/24 local tests** and strict TypeScript check passed. GitHub CI is not yet green; no APK exists. See [progress and blockers](docs/PROGRESS.md).

## Current milestone: v0.3 (source-only prototype)

- Source-derived League challenge extraction covers all 40 client definitions and four compound objectives; **no character entitlements are granted without server verification**.
- Corrected opt-in max-vs-sum run counters for best-in-one-run milestones.
- [v0.3 League challenge audit](docs/LEAGUE_V0.3.md) and [factual challenge data](evidence/league-challenges-v0.8.80.json).


- New save data starts with zero Stardust; starters are selected normally.
- Earned rewards, Lab/item purchases, achievement claims, and backup recovery are implemented and tested **with synthetic fixtures**.
- A version-locked extractor reads client catalog metadata from a separately obtained, authorized upstream snapshot. It does **not** fetch or bundle the original game resources.
- The original game's real server reward rules, unlock logic, UI integration, and Android runtime are **not implemented**.

**Docs:** [v0.2 research/verification notes](docs/PROGRESSION_V0.2.md) · [Integration plan](docs/INTEGRATION.md) · [Version-pinned observed catalog](evidence/verified-client-catalog-v0.8.80.json)

## Develop / verify

Requires Node.js 22.16+ and TypeScript 5.8.3 (or install via `npm install --global typescript@5.8.3`).

```bash
npm run test
npm run typecheck
```

GitHub Actions runs the same source-only tests on pushes and pull requests. It is **not** an APK build workflow.

## Original content and intellectual property

This repository contains only original development code, synthetic test fixtures, factual catalog observations, and planning notes. It intentionally does **not** include the original PokéBonk client, Pokémon graphics, models, sound, account data, or any game asset bundles.

Game code and assets from Charcher/Pokémon have separate owners and license terms. Their being accessible on a website or another repository is **not** authorization to redistribute them. Permission and rights review remain required before packaging/distributing protected content. The tools here do not bypass logins or download restricted material.

This project is unofficial and has no affiliation with the PokéBonk creator or Pokémon rights holders.
