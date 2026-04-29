# Migrations

Time-bounded migration projects that span multiple existing domains. Each subfolder is one migration effort; its README summarises scope, status, and links to the layer-by-layer docs inside.

Migrations are bounded by definition — once an effort lands, its docs either retire (replaced by the new normal in the architecture/ + client/ + server/ tree) or are kept as a historical reference. They are NOT a permanent home for any concept; cross-cutting concepts that survive a migration belong in `architecture/`.

## Cross-migration principles

These are universal rules every migration in this folder must follow. They are policy-level — codified once here so future ports inherit them automatically.

### Tests are the system's expectations — they must travel with the port

When porting a subsystem from one stack to another (TS → Rust today; whatever's next tomorrow), **every test that documents an expectation about the port's surface must be reproduced in the new stack**. Tests are not implementation-detail noise; they are the executable spec of "what this code does." Porting the implementation without the tests means the new stack inherits behaviour with no proof it matches.

Concretely:

- **Read the source-stack tests before writing the target-stack module.** `server/src/db/queries/__tests__/libraries.test.ts` describes ON-CONFLICT semantics, missing-row behaviour, multi-row coexistence — every one of those assertions must have a counterpart in `server-rust/src/db/queries/libraries.rs`'s `#[cfg(test)] mod tests`. The Rust port's parity isn't real until the tests agree.
- **Skip out-of-scope tests with a comment, not silence.** If the port's current step doesn't include a writer that an old test exercised (e.g. Step 1 is read-only DB; Bun's `upsertVideo` test has nothing to call), leave a comment in the new test module pointing to the source-stack test path and the migration step that will reinstate it. Future agents porting later steps will know which tests are still owed.
- **Negative paths matter as much as the happy path.** A port that handles only the success cases is the same trap as `expect()`/`unwrap()` (Invariant §14): the type system isn't being used to cover edges. Reproduce the original "returns null for unknown id" / "rejects malformed input" assertions, plus any new error variants the target stack introduces (e.g. `DbError::Invariant`, `GlobalIdError::EmptyPart`).
- **Test infrastructure may differ; assertions may not.** Bun uses a shared SQLite file driven by `src/test/setup.ts`; the Rust port uses `:memory:` per test for isolation. The mechanism is implementation; the *assertions* are the contract.
- **Integration tests live with the port's natural integration boundary.** Bun's GraphQL integration test goes through `yoga.fetch(new Request(...))`; the Rust port's lives at `server-rust/tests/graphql_integration.rs` and drives `XstreamSchema::execute` directly. The HTTP shape is covered by the e2e Playwright test the user already runs — don't re-test what's already tested at a higher layer.

This pairs with `code-style/Invariants/00-Never-Violate.md` §14 (no swallowed errors): both rules say *the unhappy path is part of the design and must be visible*. Tests make it visible at compile time; error-Result propagation makes it visible at runtime.

## Active migrations

| Folder | Hook |
|---|---|
| [`rust-rewrite/`](rust-rewrite/README.md) | Bun → Rust + Tauri desktop port. Layer-by-layer deep-dives, stable contracts, phased migration order, packaging + signing. |
