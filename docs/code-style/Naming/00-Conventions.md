# File Naming Conventions

| What | Pattern | Examples |
|---|---|---|
| React component (`.tsx` exporting a component) | `PascalCase.tsx` | `PosterCard.tsx`, `ControlBar.tsx`, `DashboardPage.tsx` |
| React component folder | `kebab-case/` | `video-card/`, `control-bar/`, `dashboard-page/` |
| Component-satellite files (same folder) | mirror the component's PascalCase prefix | `PosterCard.styles.ts`, `PosterCard.strings.ts`, `PosterCard.events.ts`, `PosterCard.stories.tsx` |
| Anything else (hook, util, service, config, test, server file) | `camelCase.ts` | `useChunkedPlayback.ts`, `formatters.ts`, `chunkPipeline.ts`, `chunker.ts`, `streamingService.test.ts` |

**Files exporting a class are still camelCase.** The class name stays PascalCase; the filename does not mirror it. The PascalCase-mirrors-filename rule applies only to React components and their satellites.

**Relay-compiler enforces** that operation/fragment names start with the containing filename — renaming a `.tsx` file requires `bun relay` in `client/` to regenerate `__generated__/` artifacts.

## Docs naming

All markdown docs under `docs/` follow a nested convention enforced by the `update-docs` skill. Filename: `NN-Topic-Name-In-PascalCase.md` where `NN` is a two-digit ordering prefix scoped to its concept folder. `README.md` is the one exemption — every concept folder has one as its table of contents. See the `update-docs` skill for placement rules.
