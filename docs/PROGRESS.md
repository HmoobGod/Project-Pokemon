# Project Pokemon — Development Progress

**Last verified source milestone:** v0.3, October 30, 2026 (America/Chicago).  
**Target:** fully offline Android game preserving earned progression, not unlock-all.

```text
OVERALL APK          ██░░░░░░░░░░░░░░░░░░  12%  rough estimate
Source + CI         ███████████░░░░░░░░░  55%  GitHub checks pending
Progression logic   ███████░░░░░░░░░░░░░  35%  synthetic tests
Client rule audit   ██████░░░░░░░░░░░░░░  30%  not server validation
Playable integration░░░░░░░░░░░░░░░░░░░░   0%
Android APK         ░░░░░░░░░░░░░░░░░░░░   0%
Phone/device tests  ░░░░░░░░░░░░░░░░░░░░   0%
Content permissions ░░░░░░░░░░░░░░░░░░░░   0%
```

## Verified source-only results
- PR #1 contains the v0.3 source additions, which passed 24/24 local automated tests and strict TypeScript checking.
- Upstream client **0.8.80 / mvur4p6p**: League catalog has **40 character definitions**, **3 starters (1,4,7)** and **4 two-part challenge definitions**. Source-only verified metadata are retained in `evidence/league-challenges-v0.8.80.json`.
- Run counter handling now distinguishes explicit lifetime sums from highest-in-one-run records.
- Read-only League objective preview **never grants unlocks**; ambiguous `league` count and unverified best counters remain unknown.
- The community snapshot separately inventories 755 expected Kanto animation/portrait/icon/cry entries; no original assets are in this repository.

## Blockers
1. GitHub CI must pass on the latest PR commit before merge. The checks had been queued; no green result confirmed at this update.
2. The **actual server run Stardust formula** and original League entitlement/claim semantics remain unverified.
3. The original client is not integrated; gameplay is not playable in this codebase.
4. Appropriate rights to package/distribute original client and Pokémon assets have not been established.
5. No APK build or physical Android tests have occurred.

## Next priorities
1. Diagnose queued GitHub CI and obtain a passing exact-head run.
2. Verify server-facing reward and challenge contracts without guessing values or bypassing authentication.
3. Build a strict source-to-game interface once authorized inputs are available.
4. Only then prepare the Android WebView shell and controlled device validation.

**These percentages are subjective planning estimates and will be revised when verified work changes.**
