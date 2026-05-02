# Code Style

Non-negotiables for anyone writing code in xstream — engineering principles, invariants, naming, patterns to follow, anti-patterns to avoid, tooling. **All agents must read the relevant subsection before coding; CLAUDE.md routes here, this tree is the canonical home.**

| Folder | Languages | Hook |
|---|---|---|
| [`Principles/`](Principles/README.md) | All | The four engineering meta-rules: fix root causes, don't weaken safety timeouts, never swallow errors, tests travel with the port. |
| [`Invariants/`](Invariants/README.md) | Rust + TS | The structural rules. Breaking them silently corrupts runtime behaviour. |
| [`Naming/`](Naming/README.md) | All | File naming: PascalCase for React components, camelCase for TS, snake_case for Rust. |
| [`Server-Conventions/`](Server-Conventions/README.md) | Rust | Resolver shape, presenter layer, async-graphql derive macros, `setFfmpegPath` discipline. |
| [`Client-Conventions/`](Client-Conventions/README.md) | TS / React | Relay fragment contract, Griffel, Nova eventing, localization. |
| [`Testing/`](Testing/) | All | Cross-cutting testing rules — tests travel with ports, assertions are the contract. |
| [`Anti-Patterns/`](Anti-Patterns/README.md) | All | The full "don't" list. |
| [`Tooling/`](Tooling/README.md) | Rust + TS + SQL | Linters, formatters, pre-commit hooks per language. |
