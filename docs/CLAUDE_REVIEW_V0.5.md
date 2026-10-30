# Claude review packet — v0.5 source-only guards

**Repository:** https://github.com/HmoobGod/Project-Pokemon
**PR:** will be populated after creation.
**Review base:** merged v0.4.2 main, SHA `5d97798c84147aacc4e32e66ebd691d9179bd0b9`.

### Review questions

- Verify map prerequisite cycle/root and imported `mapsWon` checks reject invalid state and do not reject valid chains.
- Verify strict pending ticket keys and 128-ticket defensive cap reject malformed/imported data without data loss or unexpected writes.
- Confirm passing ticket.mode to RewardPolicy is compatible with existing tests and policy implementations.
- Look for unsafe schema changes, mode-dependent reward exploits, and race/backup regressions.
- Check that the test suite and strict typecheck pass. Independently inspect exact new HEAD and GitHub CI result.
- Audit tracked files for original client content, game assets and secrets.
- Return exact reviewed head SHA, test results, blocking and nonblocking findings, verdict, and merge YES/NO.

This is **not a playable APK** and is not original-server economy parity. Prior N18 and N19 remain deferred and must be addressed before user-facing restoration UI.
