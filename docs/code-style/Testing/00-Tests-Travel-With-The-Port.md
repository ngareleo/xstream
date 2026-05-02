# Tests Travel With The Port

> The implementation can be a rewrite; the assertions are the contract.

When porting a subsystem from one stack to another (TS → Rust today; whatever's next tomorrow), **every test that documents an expectation about the port's surface must be reproduced in the new stack**. Tests are not implementation-detail noise; they are the executable spec of "what this code does." Porting the implementation without the tests means the new stack inherits behaviour with no proof it matches.

This is one of the three engineering non-negotiables in `CLAUDE.md`. It pairs with the no-swallowed-errors rule in [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) §14: both say *the unhappy path is part of the design and must be visible*. Tests make it visible at compile time; error-Result propagation makes it visible at runtime.

## Concretely

- **Read the source-stack tests before writing the target-stack module.** A test like `libraries.test.ts` describes ON-CONFLICT semantics, missing-row behaviour, multi-row coexistence — every one of those assertions must have a counterpart in the target's `#[cfg(test)] mod tests` (or whatever the new stack's equivalent is). Parity isn't real until the tests agree.
- **Skip out-of-scope tests with a comment, not silence.** If the port's current step doesn't include a writer that an old test exercised (e.g. step 1 is read-only DB; the source has an `upsertVideo` test with nothing to call), leave a comment in the new test module pointing to the source-stack test path and the migration step that will reinstate it. Future agents porting later steps will know which tests are still owed.
- **Negative paths matter as much as the happy path.** A port that handles only the success cases is the same trap as `expect()`/`unwrap()` (Invariants §14): the type system isn't being used to cover edges. Reproduce the original "returns null for unknown id" / "rejects malformed input" assertions, plus any new error variants the target stack introduces (e.g. `DbError::Invariant`, `GlobalIdError::EmptyPart`).
- **Test infrastructure may differ; assertions may not.** A source stack might use a shared SQLite file driven by a setup hook; the Rust port uses `:memory:` per test for isolation. The mechanism is implementation; the *assertions* are the contract.
- **Integration tests live with the port's natural integration boundary.** A source stack might drive HTTP via `yoga.fetch(new Request(...))`; the Rust port drives `XstreamSchema::execute` directly because the axum handler is a thin wrapper over the schema. The HTTP shape is covered at the e2e Playwright layer — don't re-test what's already tested at a higher layer.

## Why this lives in `code-style/`, not `migrations/`

Migrations come and go; the rule that ports preserve their tests does not. When the next port lands (any layer, any language), this rule applies before any of the migration-specific docs even exist. Codifying it here means the next migration inherits the policy automatically.
