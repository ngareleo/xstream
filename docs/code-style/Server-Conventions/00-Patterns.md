# Server Conventions

- Resolvers have explicit return types (`: GQLLibrary`, `: Promise<GQLTranscodeJob>`).
- Formatting lives in `server/src/graphql/presenters.ts` — resolvers call `presentLibrary()` / `presentVideo()` / `presentJob()`, never `toGlobalId` directly.
- Resolvers → services → `db/queries/`. Simple read-only resolvers may import from `db/queries/` directly, but formatting still goes through presenters.
- **One resolver per field** (see [`../Invariants/00-Never-Violate.md`](../Invariants/00-Never-Violate.md) #10).
- **`setFfmpegPath` is module-global.** Only `resolveFfmpegPaths` in `ffmpegPath.ts` is allowed to call it. Any other module that sets it at module-load time silently clobbers the resolver.
