# Linting and Formatting

Per-language tooling. Every commit ships through these gates — pre-commit for fast local feedback, CI for the full check.

## Rust (`server-rust/`, `src-tauri/`)

- **Lint:** `cargo clippy --workspace --exclude xstream-tauri --all-targets -- -D warnings`. Treats every clippy warning as a build failure.
- **Format:** `cargo fmt --all`.
- **`xstream-tauri` carve-out:** the Tauri shell crate requires GTK/webkit2gtk apt deps to compile. It is excluded from the main clippy invocation and is linted by the dedicated `tauri-build` CI job, not the local pre-commit.
- **Pre-commit:** Rust files are NOT linted by the pre-commit hook — only by CI. Run `cargo clippy` locally before pushing if you want fast feedback.

## TypeScript / React (`client/`)

- **Lint command:** `bun run --filter client lint`, which runs `tsc --noEmit && eslint src`.
- **Stack:** ESLint v10 + `typescript-eslint` + `eslint-plugin-react-hooks`.
- **Format:** Prettier v3 — `bun run format` (write) / `bun run format:check` (CI gate). Applies to `.ts`, `.tsx`, `.json`.

### Enforced ESLint rules

Each rule has a reason; "the linter says so" is not the rationale.

| Rule | What it enforces | Why |
|---|---|---|
| `explicit-module-boundary-types` | Exported functions declare return types explicitly. | Exported APIs are contracts; inferred return types silently change when the body changes. |
| `no-floating-promises` | Promises must be `await`ed or explicitly `void`-ed. | A floating promise is an unhandled rejection waiting to happen and an invisible source of out-of-order effects. |
| `consistent-type-imports` | Type-only imports use `import type`. | Lets the bundler tree-shake type-only references; surfaces accidental runtime imports. |
| `no-non-null-assertion` | `!` is forbidden. Use `?.` or explicit `if` guards. (Tests post-`expect` are excepted.) | Same shape as the Rust no-`unwrap` rule: opting out of the type system silently corrupts behaviour at runtime. |
| `react-hooks/rules-of-hooks` (error) + `react-hooks/exhaustive-deps` (warn) | Hooks called unconditionally; deps array complete. | Conditional hooks corrupt React's call-order assumption; missing deps cause stale closures. |
| `no-restricted-imports` (parent traversal) | Cross-module imports use the `~/` alias; `../` is banned. Same-directory `./` for colocated files is fine. | Stable paths survive moves; `../../../foo` is the dominant source of import churn during refactors. |

## SQL (`server-rust/src/db/queries/`)

- **No formatter, no linter.** SQL files are reviewed by hand against the structural rules in [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) §1 (all SQL goes through `db/queries/`) and [`../Anti-Patterns/00-What-Not-To-Do.md`](../Anti-Patterns/00-What-Not-To-Do.md) §1–2 (no ORM, no ad-hoc SQL outside `db/queries/`).
- **Naming:** one file per table or per query group; queries are exposed as named Rust functions returning `DbResult<T>`.

## Pre-commit hook

- **Stack:** Husky v9 + lint-staged.
- **Coverage:** auto-fixes staged `.ts`/`.tsx` only. Rust and SQL are gated in CI, not pre-commit, to keep `git commit` fast even when the workspace has uncached Rust builds.
- **Bypassing:** `--no-verify` is forbidden as a routine. If the hook fails, fix the underlying issue rather than skipping it.

## Where this lives in the harness

CLAUDE.md routes here; this file is the canonical home. The pre-commit hook is configured in `package.json` (`lint-staged` block) and `.husky/`.
