# Server Conventions

- Resolvers have explicit return types using async-graphql derive macros.
- Type conversion lives in GraphQL type definitions via derive macros — resolvers return domain types, which are automatically converted to GraphQL types.
- Union return types require `#[graphql(type_name = "...")` attributes on every variant and a `#[derive(Union)]` on the enum. The macros auto-generate `__resolveType`.
- Resolvers → services → `db/queries/`. Simple read-only resolvers may import from `db/queries/` directly.
- **One resolver per field** (see [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) #10).
