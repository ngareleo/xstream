# Server Conventions

- Resolvers have explicit return types using async-graphql derive macros.
- Type conversion lives in GraphQL type definitions via derive macros — resolvers return domain types, which are automatically converted to GraphQL types.
- Union return types require `#[graphql(type_name = "...")` attributes on every variant and a `#[derive(Union)]` on the enum. The macros auto-generate `__resolveType`.
- Resolvers → services → `db/queries/`. Simple read-only resolvers may import from `db/queries/` directly.
- **One resolver per field** (see [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) #10).
- **Comments:** `///` rustdoc on every `pub` item and `//!` at the top of every module are expected. Inline `//` is reserved for non-obvious context (ffmpeg flag interactions, VAAPI quirks, protocol gotchas, race-condition rationale, traced incidents). `// SAFETY:` is mandatory above every `unsafe { }` block. Long-form prose moves to `docs/server/` or `docs/architecture/`. Full policy: [`../Anti-Patterns/01-Commenting.md`](../Anti-Patterns/01-Commenting.md).
