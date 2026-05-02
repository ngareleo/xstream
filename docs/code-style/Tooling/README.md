# Tooling

Linters, formatters, and pre-commit hooks — what runs, where, and on which language.

| File | Hook |
|---|---|
| [`00-Linting-And-Formatting.md`](00-Linting-And-Formatting.md) | Per-language tooling: Rust (`cargo clippy`, `cargo fmt`); TS/React (ESLint v10, Prettier v3, six enforced rules); SQL (raw, no formatter); pre-commit (Husky v9 + lint-staged on TS/TSX only). |

Languages covered: **Rust** (`server-rust/`, `src-tauri/`), **TypeScript/React** (`client/`), **SQL** (`server-rust/src/db/queries/`).
