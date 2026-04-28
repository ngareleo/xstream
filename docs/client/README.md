# Client

Topics scoped to the React client. Cross-cutting client/server concepts (streaming, Relay, observability) live under [`../architecture/`](../architecture/README.md).

| Folder | Hook |
|---|---|
| [`Config/`](Config/README.md) | Compile-time tunables (`clientConfig`) + two-layer config model (appConfig defaults / featureFlags overrides). |
| [`Feature-Flags/`](Feature-Flags/README.md) | User-scoped flag registry and how to add/read/remove one. |
| [`Debugging-Playbooks/`](Debugging-Playbooks/README.md) | Common client bugs and how to track them down (Relay fragments, GraphQL errors, MSE issues). |
| [`Bundle-Chunks/`](Bundle-Chunks/README.md) | Rsbuild chunk-splitting strategy — upgrade-cadence groups, regex anchor invariant, `bun run analyze`. |
