# PageSkeleton

Collection of page-level skeleton (shimmer) loaders for different layouts while
data is loading. Exports four skeleton variants: `DashboardSkeleton`, `LibrarySkeleton`,
`WatchlistSkeleton`, `SettingsSkeleton`.

**Source:** `client/src/components/page-skeleton/`
**Used by:** Page suspense fallbacks and data loading states.

## Role

Placeholder UI showing animated shimmer patterns that match the final page layout.
Gives users visual feedback that content is loading without jarring blank pages.

## Skeleton components

### DashboardSkeleton

- Large hero shimmer (220px height).
- Location bar breadcrumb.
- Column header (6 columns with varying widths).
- Three profile rows, each with icon, title/subtitle, and action buttons.

### LibrarySkeleton

- Filter bar (search + 2 buttons).
- Two poster grids (6-item, 4-item) with titles and metadata beneath each.

### WatchlistSkeleton

- Stats row (3 stat cells with icon + label).
- Scrollable list (5 items) with thumbnail, title/subtitle, progress bar, action button.

### SettingsSkeleton

- Two-column layout (nav + body).
- Left nav: category label + 5 nav items.
- Right body: section title, large control area, 3 row items with metadata.

## Layout & styles

All use `makeStyles` from Griffel:

### Shared

- **skeleton** — animated shimmer: `background: linear-gradient(90deg, #161616 25%, #1C1C1C 50%, #161616 75%)`, `backgroundSize: 200% 100%`, animation slides position over `1.6s ease-in-out infinite`, `borderRadius: 4px`.

### DashboardSkeleton

- **root** — flex column, height 100%, overflow hidden.
- **hero** — `height: 220px`.
- **locationBar** — `height: 38px`, border-bottom, flex container, padding 24px.
- **dirHeader** — grid `"32px 1fr 120px 160px 80px 80px"`, border-bottom.
- **dirRow** — same grid columns, `height: 52px`.

### LibrarySkeleton

- **filterBar** — flex row, gap 8px, padding 8px 16px, border-bottom.
- **grid** — `display: grid`, `gridTemplateColumns: repeat(auto-fill, minmax(160px, 1fr))`, `gap: 12px`, padding 20px.
- **posterCard** — border-radius md, overflow hidden, bg colorSurface2.
- **posterImg** — padding-bottom 150% (aspect ratio).
- **posterInfo** — flex column, gap 6px, padding 8px 10px.

### WatchlistSkeleton

- **statsRow** — flex row, border-bottom, gap and padding.
- **statCell** — flex column, gap 6px, border-right.
- **scrollBody** — flex 1, overflow-y auto, padding 24px.
- **listItem** — grid `"60px 1fr auto auto"`, gap 12px, padding 10px 0.
- **listThumb** — `60x34px`, border-radius 4px.

### SettingsSkeleton

- **settingsShell** — grid `"220px 1fr"`, height 100%, padding-top headerHeight.
- **settingsNav** — border-right, bg colorBg1, padding 20px, flex column, gap 12px.
- **settingsNavItem** — padding 9px 12px.
- **settingsBody** — overflow-y auto, padding 32px 40px, flex column, gap 16px.
- **settingsRow** — flex column, gap 8px, padding-bottom 14px, border-bottom.

## Behaviour

- Renders on demand; parent page controls visibility via Suspense or conditional render.
- Shimmer animation runs continuously until replaced with real content.
- No user interaction; purely visual.

## Notes

- Each skeleton should match the layout of the corresponding page component to provide accurate visual feedback.
- The shimmer color (`#161616` → `#1C1C1C`) blends with the dark theme background.
- Scrollable areas show only initial rows; real content may extend further.
