# Components — Release-Design Migration

One spec file per UI element of `design/Release/`. Each file follows the same skeleton (Files, Purpose, Visual, Behaviour, Subcomponents, Porting checklist, Status). When you edit a file in the lab, update the matching spec. When you port a component to `client/src/`, tick the checklist.

Inline subcomponents (ProfileRow, FilmRow, ProfileChip, PosterCard, ListRow, VideoArea, SidePanel, SettingsRow, Toggle) are documented as **sections within their parent file**, not separate files. Promote one to its own file when its `.tsx` is extracted.

## Catalog

| Component | Files (lab) | Spec | Production |
|---|---|---|---|
| [AppShell](AppShell.md) | `components/Layout/AppShell.{tsx,styles.ts}` | baseline | not started |
| [AppHeader](AppHeader.md) | `components/AppHeader/AppHeader.{tsx,styles.ts}` | done | not started |
| [Sidebar](Sidebar.md) | `components/Sidebar/Sidebar.{tsx,styles.ts}` | baseline | not started |
| [DetailPane](DetailPane.md) | `components/DetailPane/DetailPane.tsx` | baseline | not started |
| [Poster](Poster.md) | `components/Poster/Poster.tsx` | baseline | not started |
| [Logo](Logo.md) | `components/Logo/{Logo01..Logo07,index}.tsx` | baseline | not started |
| [Profiles page](Profiles.md) | `pages/Profiles/Profiles.{tsx,styles.ts}` | baseline | not started |
| [Library page](Library.md) | `pages/Library/Library.tsx` | baseline | not started |
| [Player page](Player.md) | `pages/Player/Player.tsx` | baseline | not started |
| [Settings page](Settings.md) | `pages/Settings/Settings.tsx` | baseline | not started |
| [DesignSystem page](DesignSystem.md) | `pages/DesignSystem/DesignSystem.tsx` | baseline | n/a — lab only |
| [Goodbye page](Goodbye.md) | `pages/Goodbye/Goodbye.tsx` | baseline | not started |
| [NotFound page](NotFound.md) | `pages/NotFound/NotFound.tsx` | baseline | not started |

Status conventions: see the [migration README](../README.md#status-conventions).

## Conventions for spec files

1. **Files** — paths to `.tsx` (+ `.styles.ts` if present). Note the matching Prerelease path as behavioural reference for anything not re-stated.
2. **Purpose** — one sentence. What this element renders and why it exists.
3. **Visual** — concrete values: tokens used, dimensions, layout (grid/flex), colours, fonts, animations.
4. **Behaviour** — state, URL params, event handlers, animations, keyboard navigation, accessibility attrs.
5. **Subcomponents** (when applicable) — one section per inline component.
6. **Porting checklist** — one `[ ]` per detail above; the agent porting to `client/src/` ticks each box on completion.
7. **Status** — `[ ]/[x] Designed in design/Release lab`, `[ ]/[x] Production implementation`. Date the latest design change.

`TODO(redesign)` markers indicate values that the current baseline does not yet pin down — a redesign session must fill them in and remove the marker.
