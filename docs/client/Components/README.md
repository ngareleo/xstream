# Client Components

Per-component design specs for `client/src/components/` and the page-level
shells under `client/src/pages/`. Each spec covers role, props, layout +
styles, behaviour, and data wiring — the agent-facing reference for how a
component looks and behaves today.

Outstanding work that hasn't yet shipped is tracked separately in
[`docs/release/Outstanding-Work.md`](../../release/Outstanding-Work.md).

## Catalog

### Pages (route shells)

| Spec | Route | Source |
|---|---|---|
| [CreateProfile](CreateProfile.md) | `/profiles/new` | `client/src/pages/create-profile-page/` |
| [EditProfile](EditProfile.md) | `/profiles/:id/edit` | `client/src/pages/edit-profile-page/` |
| [Error](Error.md) | `/error` (+ ErrorBoundary fallback) | `client/src/pages/error-page/` |
| [Goodbye](Goodbye.md) | `/goodbye` | `client/src/pages/goodbye-page/` |
| [Library](Library.md) | `/` | `client/src/pages/homepage/` |
| [NotFound](NotFound.md) | `*` (catch-all) | `client/src/pages/not-found-page/` |
| [Player](Player.md) | `/player/:id` | `client/src/pages/player-page/` |
| [Profiles](Profiles.md) | `/profiles` | `client/src/pages/profiles-page/` |
| [Settings](Settings.md) | `/settings` | `client/src/pages/settings-page/` |
| [Watchlist](Watchlist.md) | `/watchlist` | `client/src/pages/watchlist-page/` |

### Shell + chrome

| Spec | Source |
|---|---|
| [AccountMenu](AccountMenu.md) | `client/src/components/account-menu/` |
| [AppHeader](AppHeader.md) | `client/src/components/app-header/` |
| [AppShell](AppShell.md) | `client/src/components/app-shell/` |
| [Logo](Logo.md) | `client/src/components/logo/` |

### Library / Profiles surfaces

| Spec | Source |
|---|---|
| [DetailPane](DetailPane.md) | `client/src/components/detail-pane/` |
| [DirectoryBrowser](DirectoryBrowser.md) | `client/src/components/directory-browser/` |
| [EmptyLibrariesHero](EmptyLibrariesHero.md) | `client/src/components/empty-libraries-hero/` |
| [FilmDetailsOverlay](FilmDetailsOverlay.md) | `client/src/components/film-details-overlay/` |
| [FilmRow](FilmRow.md) | `client/src/components/film-row/` |
| [FilmVariants](FilmVariants.md) | `client/src/components/film-variants/` |
| [FilmTile](FilmTile.md) | `client/src/components/film-tile/` |
| [FilterSlide](FilterSlide.md) | `client/src/components/filter-slide/` |
| [LinkSearch](LinkSearch.md) | `client/src/components/link-search/` |
| [MediaKindBadge](MediaKindBadge.md) | `client/src/components/media-kind-badge/` |
| [Poster](Poster.md) | `client/src/components/poster/` |
| [PosterRow](PosterRow.md) | `client/src/components/poster-row/` |
| [ProfileForm](ProfileForm.md) | `client/src/components/profile-form/` |
| [ProfileRow](ProfileRow.md) | `client/src/components/profile-row/` |
| [ProfilesExplorer](ProfilesExplorer.md) | `client/src/components/profiles-explorer/` |
| [SearchSlide](SearchSlide.md) | `client/src/components/search-slide/` |
| [SearchSuggestionCard](SearchSuggestionCard.md) | `client/src/components/search-suggestion-card/` |
| [SeasonsPanel](SeasonsPanel.md) | `client/src/components/seasons-panel/` |
| [ShowDetailsOverlay](ShowDetailsOverlay.md) | `client/src/components/show-details-overlay/` |
| [ShowTile](ShowTile.md) | `client/src/components/show-tile/` |

### Player subcomponents

| Spec | Source |
|---|---|
| [ControlBar](ControlBar.md) | `client/src/components/control-bar/` |
| [EdgeHandle](EdgeHandle.md) | `client/src/components/edge-handle/` |
| [PlayerContent](PlayerContent.md) | `client/src/components/player-content/` |
| [PlayerEndScreen](PlayerEndScreen.md) | `client/src/components/player-end-screen/` |
| [PlayerSidebar](PlayerSidebar.md) | `client/src/components/player-sidebar/` |
| [VideoArea](VideoArea.md) | `client/src/components/video-area/` |
| [VideoPlayer](VideoPlayer.md) | `client/src/components/video-player/` |

### Settings primitives + tabs

| Spec | Source |
|---|---|
| [DangerTab](DangerTab.md) | `client/src/components/danger-tab/` |
| [FlagsTab](FlagsTab.md) | `client/src/components/flags-tab/` |
| [LibraryTab](LibraryTab.md) | `client/src/components/library-tab/` |
| [MetadataTab](MetadataTab.md) | `client/src/components/metadata-tab/` |
| [SettingsRow](SettingsRow.md) | `client/src/components/settings-row/` |
| [SettingsSelector](SettingsSelector.md) | `client/src/components/settings-selector/` |
| [SettingsTabs](SettingsTabs.md) | `client/src/components/settings-tabs/` |
| [SettingsToggle](SettingsToggle.md) | `client/src/components/settings-toggle/` |
| [TraceHistoryTab](TraceHistoryTab.md) | `client/src/components/trace-history-tab/` |

### Loading / progress / navigation

| Spec | Source |
|---|---|
| [LoadingBar](LoadingBar.md) | `client/src/components/loading-bar/` |
| [PagePlaceholder](PagePlaceholder.md) | `client/src/components/page-placeholder/` |
| [PageSkeleton](PageSkeleton.md) | `client/src/components/page-skeleton/` |
| [RouterNavigationLoader](RouterNavigationLoader.md) | `client/src/components/router-navigation-loader/` |

### Error / dev infrastructure

| Spec | Source |
|---|---|
| [DevThrowTarget](DevThrowTarget.md) | `client/src/components/dev-throw-target/` |
| [DevTools](DevTools.md) | `client/src/components/dev-tools/` |
| [ErrorBoundary](ErrorBoundary.md) | `client/src/components/error-boundary/` |

## Conventions

- **Source** lines point at the directory hosting the component's
  `<Pascal>.tsx`, `.styles.ts`, `.strings.ts`, `.events.ts`,
  `.stories.tsx` files.
- **Used by** lines list the parents (other components, pages, or
  routes) — useful for knowing where a change ripples.
- Layout values are quoted from the actual `.styles.ts` file. If the
  spec drifts from the code, the code wins; update the spec.
- Subcomponents have their own files. Page specs (Player, Settings,
  Profiles, Library) describe top-level orchestration and link to the
  per-subcomponent files for detail.
