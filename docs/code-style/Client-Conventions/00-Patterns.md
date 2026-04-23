# Client Conventions

- `useLazyLoadQuery` lives **only** in `src/pages/`. Components read data via fragments + `useFragment`.
- Fragment naming: `<ComponentName>_<propName>` (e.g. `VideoCard_video`). Operation names must start with the containing filename (relay-compiler enforces).
- Component definition style: `export const Name: FC<Props> = (…) => { … };` — always `FC`. Never function declarations.
- Styles: Griffel (`makeStyles`) only. Classes in `global.css` are limited to browser globals (resets, fonts, scrollbar, `[data-tip]`, `body.resizing`).
- Nova eventing: bubble events from children via `useNovaEventing().bubble()`; intercept in parents via `NovaEventingInterceptor`. One `NovaEventingProvider` at the app root, never more. Events are colocated: `ComponentName.events.ts`.
- User-visible strings use `react-localization` (`new LocalizedStrings({ en: { … } })`) — no plain string exports in `*.strings.ts`.
- Every component has a `<ComponentName>.stories.tsx`. Relay fragment components use the `withRelay` decorator from `client/src/storybook/withRelay.tsx` (not raw `createMockEnvironment`). Story queries carry `@relay_test_operation`.
