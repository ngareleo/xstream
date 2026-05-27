# Client Config

| File | Hook |
|---|---|
| [`00-ClientConfig.md`](00-ClientConfig.md) | `client/src/config/appConfig.ts` — compile-time tunables, two-layer config model (appConfig defaults + featureFlags overrides). Namespaces: `playback`, `buffer`, `session` (idle-timeout tuning). |
| Route paths | `client/src/config/routePaths.ts` — single source of truth for the app's route templates (`ROUTE_PATHS` object + `RoutePath` type + `ALL_ROUTE_PATHS` array). Consumed by `router.tsx` (route `path` props) and `routeTemplate()` helper for route-template normalization in telemetry. See Client-Conventions routing patterns. |
