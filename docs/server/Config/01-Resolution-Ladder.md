# Resolution Ladder

`RESOLUTION_PROFILES` in `server/src/config.ts` defines 240p → 4K with bitrate targets.

The Resolution enum is mirrored in four places that **all change together**:

- `server/src/types.ts` — internal enum
- `server/src/config.ts` — `RESOLUTION_PROFILES` map
- `server/src/graphql/schema.ts` — GraphQL enum declaration
- `server/src/graphql/mappers.ts` — `GQL_TO_RESOLUTION` / `RESOLUTION_TO_GQL` conversions

If any one of these is out of sync, the other three will still type-check but runtime behavior breaks silently (the mapper returns `undefined` for the missing variant).
