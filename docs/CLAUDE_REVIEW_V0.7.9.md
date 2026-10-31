# Independent Claude review — Project Pokemon v0.7.9, PR #13

This PR adds the **first checksummed read-only raw emergency recovery export**; still no APK, import UI, or gameplay. Review the changed source and focused tests, not all historical PRs.

**Base:** merged v0.7.8 main `7f098716d563beb9e8b4b38476b13837d7cff88b`. Fetch `refs/pull/13/head` fresh and report the full exact SHA; independently confirm merge-base equals base.

## Scope and adversarial tests

1. Review `src/recovery-bundle-integrity.ts` and `test/recovery-bundle-integrity.test.ts`. New envelope is strictly `kind,schema,sha256,payload`, hash lower-case 64-digit SHA-256 over UTF-8 of the **exact original bundle JSON string**. Parser validates digest before delegating to existing six-slot raw structural parser. Reject missing/extra fields, altered payload/digest, bad type/schema, invalid internal slots.
2. Check losslessness for old/unknown schema bytes, malformed JSON, absent vs empty slot, Unicode and lone surrogates. Verify no existing production recovery or progression methods altered, no localStorage writes, no foreign-edition access and the previous unchecksummed export/parser remains byte-for-byte unchanged.
3. Verify race protections: original two-pass snapshot plus post-digest third read, zero writes by new code; don't call it atomic or tamper-proof. Simulate a changed primary on third read; confirm failure. Evaluate generic WebCrypto errors and malformed nested JSON.
4. Check source-only N1/N2 from PR #12: new dual-invalid primary (schema 2 + future sourceVersion) asserts schema-first precedence; unknown live refusal should fail closed in test rather than default to backup unreadable. Confirm pinned 576 count.
5. Run all Node source tests and strict TypeScript at the exact head and verify both push and pull-request CI at that head; report counts and links.
6. F3/F4 real recovery UX **NOT FIXED**; no bundle import/restore/clear implemented. SHA-256 is integrity only, not authentication; future import requires explicit consent, rollback and conflict handling. No official PokéBonk assets/gameplay or Android APK.

Return complete HEAD SHA, base/merge-base, CI, findings, **APPROVE or REQUEST CHANGES**, and explicit **MERGE YES or NO**. Do not modify repo during independent review.
