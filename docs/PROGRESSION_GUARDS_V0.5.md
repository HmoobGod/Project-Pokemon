# Project Pokemon v0.5 — Pre-integration progression guards

**Status:** Source-only development branch, not an APK. This is a synthetic-fixture test milestone.

## Changes

- Block cyclic map prerequisite chains, missing prerequisite maps, and rootless maps before gameplay can access an impossible path.
- Reject save data where a conquered map is missing its prerequisite victory. This checks only the source-only model; real map/difficulty rules still need authoritative verification.
- Reject run tickets containing unknown or missing keys rather than silently accepting unsupported serialized fields.
- Limit pending uncompleted run tickets to **128** (defensive prototype limit, **not** an asserted PokéBonk game rule). Imported profiles over the limit are rejected without modifying stored data.
- Pass ticket mode (`classic` or `other`) to the injected `calculateRunStardust(report,map,mode)` function. The real Stardust formula remains **unknown** and **unimplemented**. Existing two-parameter TypeScript implementations remain compatible because additional parameters can be ignored.

## Scope and risks

- No UI changes or Android packaging. No game assets included.
- No original server economy logic, original character-grant rules, or authentic map difficulty semantics are being claimed.
- A strict ticket schema and cap may reject legacy or future incompatible saves; this requires a versioned migration plan before a production release.
- Claude previously flagged N18 (undo after gameplay can discard interim progress) and N19 (no explicit discard for incompatible saves). These remain **unresolved** and must be addressed before any user-facing recovery controls.

## Review gates

1. Exact branch-head GitHub CI source-tests and strict typecheck pass.
2. Independent Claude review of v0.5 diff against approved, merged v0.4.2 main.
3. Any blocking defects fixed and reviewed before merging PR #2.
