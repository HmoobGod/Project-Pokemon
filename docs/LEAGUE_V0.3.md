# v0.3 — League challenge audit and aggregation safety

Target: Charcher's PokéBonk **0.8.80**, client build `mvur4p6p`.

## Source evidence

The publicly served client configuration contains 40 League character definitions, including three starter choices (species 1, 4 and 7). Each includes one or more client-facing challenge goals. The source-only extractor now reads their IDs, condition counters and numeric goals, then fails closed on absent/ambiguous challenge definitions or version changes. The script does not execute the upstream JavaScript.

The real v0.8.80 client was inspected independently on 2026-10-30. All 40 entries matched the extractor's structural assumptions; four entries (131, 133, 143, 147) contained two simultaneous objectives. The 151 character entry has a client condition `league >= 78`, even though the selectable League-character list contains only 40 definitions. The actual meaning of `league` must be confirmed with upstream/backend behavior rather than inferred from local playable unlock count. No unlock is granted on this evidence alone.

## New source-only improvements

- `tools/extract-verified-catalog.mjs` now emits `leagueChallenges` with one or more goals and `client-objectives-only` status, while leaving server unlock decisions unverified.
- `src/league.ts` gives a **read-only** indication of which client-side objectives appear to have been met. All results explicitly have `serverVerified=false` and `canGrantUnlock=false`. Unknown counters, ambiguous `league` counts, and unverified `best_` aggregations show unknown rather than awarding progress.
- `src/progression.ts` accepts explicit per-counter accumulation modes: `sum` for cumulative counters, `max` for records such as `maxLevel` and `best_healed`. No implicit heuristic changes are applied to save data.
- Added unit tests for the new parser, composite conditions, max-versus-sum rules, and denial of unverified claims.

## What is *not* implemented

The original backend's authoritative achievement entitlement, League unlock validation, Stardust-per-run formula, per-map difficulty gates, research mechanics and Android gameplay integration remain unknown. The tests use synthetic profiles and zero-value rewards. No original game code, Pokémon images, or game bundle is included in this public repo. Redistribution requires suitable rights.

## Immediate acceptance gate

Before a League character can be unlocked in our offline edition, verify each source counter's lifetime/per-run semantics, `league` and `speciesPlayed` definitions, and relevant server eligibility/claim behavior. Only then add an entitlement mutation with single-claim persistence and integration tests. Do not treat a client tooltip as proof of a server-approved unlock.
