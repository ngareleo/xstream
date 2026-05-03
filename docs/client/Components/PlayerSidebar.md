# PlayerSidebar

Right-side drawer panel. Displays "NOW PLAYING" header with title, metadata, and plot (for movies/series). For series: shows episode picker (SeasonsPanel, accordion mode). For movies: shows "UP NEXT" (up to 3 related videos) and "FROM YOUR WATCHLIST" (future work). Footer contains "OPEN IN VLC" and "BACK" buttons. Entirely presentational — parent (PlayerContent) owns open/close state.

**Source:** `client/src/components/player-sidebar/`
**Used by:** `PlayerContent` (rendered conditionally when `open && !chromeHidden`, positioned absolutely at `right: 0`).

## Role

The post-playback discovery and navigation surface. Surfaces the currently-playing film/episode metadata, enables episode switching for series via SeasonsPanel, and displays suggestions (up-next or watchlist). Owned by VideoArea in terms of animations (slide/fade transitions), but orchestrated by PlayerContent for open/close state.

## Props

| Prop | Type | Notes |
|---|---|---|
| `video` | `PlayerSidebar_video$key` | Relay fragment ref. Carries `id`, `title`, `durationSeconds`, `metadata`, `library { videos(first: 6) }`, and spreads `...SeasonsPanel_video`. |
| `open` | `boolean` | Controls visibility and `aria-hidden`. True → visible, False → off-screen. |
| `seriesPick` | `SidebarSeriesPick \| null` | Episode metadata for series (seasonNumber, episodeNumber, episodeTitle). Null for movies. |
| `onClose` | `() => void` | Close button handler. |
| `onBack` | `() => void` | Back button handler. |
| `onSelectEpisode` | `(seasonNumber: number, episodeNumber: number) => void` | Called when SeasonsPanel picks an episode. |

## Layout & styles

### Root panel (`.root`, `.rootHidden`)

- `position: absolute`, `top: 0`, `right: 0`, `bottom: 0`, `width: 290px`.
- `backgroundColor: colorBg1`, `border-left: 1px solid colorBorder`, `boxShadow: -12px 0 32px rgba(0,0,0,0.45)`.
- `display: flex`, `flexDirection: column`, `overflowX: hidden`, `overflowY: hidden`, `zIndex: 20`.
- **Visibility**:
  - `.root`: `transform: translateX(0)`, `opacity: 1`.
  - `.rootHidden` (applied when `!open`): `transform: translateX(100%)`, `opacity: 0`, `pointerEvents: none`.
  - `transitionProperty: transform, opacity`, `transitionDuration: 0.3s`, `transitionTimingFunction: ease`.
- **`aria-hidden`**: Set to `!open` for accessibility.

### Close button (`.closeBtn`)

- `position: absolute`, `top: 12px`, `right: 12px`, `width: 26px`, `height: 26px`, `zIndex: 25`.
- `borderRadius: 999px`, `backgroundColor: rgba(0,0,0,0.35)`, semi-transparent border, `color: colorTextDim`.
- `display: flex`, `alignItems: center`, `justifyContent: center`, `cursor: pointer`.

### Header section (`.header`)

- `paddingTop: 20px`, `paddingBottom: 14px`, `paddingLeft/right: 18px`.
- `borderBottom: 1px solid colorBorderSoft`.
- **Eyebrow** (`.nowPlayingEyebrow`): `"● NOW PLAYING"`, `fontMono 11px uppercase`, `letterSpacing: 0.18em`, green text.
- **Title** (`.title`): `fontHead 26px`, uppercase, `color: colorText`, `marginTop: 8px`, `lineHeight: 1`, `letterSpacing: -0.01em`.
- **Meta** (`.meta`): `fontMono 11px uppercase`, `color: colorTextMuted`, `marginTop: 6px`. Format: `"year · genre · duration"`.
- **Plot** (`.plot`): When present, `fontSize: 11px`, `color: colorTextDim`, `marginTop: 10px`, `lineHeight: 1.5`, clamped to 3 lines via `-webkit-box`, `-webkit-line-clamp: 3`.
- **Episode row** (`.episodeRow`, series only): `display: flex`, `alignItems: center`, `columnGap: 10px`, `marginTop: 10px`.
  - **Episode code** (`.episodeCode`): Green-bordered chip (same styling as VideoArea), `S01E03` format, `fontWeight: 600`.
  - **Episode title** (`.episodeTitle`): Episode name, white, `textTransform: none`, `letterSpacing: 0.04em`.

### Body section (`.body`)

- `paddingTop: 16px`, `paddingBottom: 16px`, `paddingLeft/right: 18px`, `flexGrow: 1`, `overflowY: auto`.
- **Eyebrow** (`.bodyEyebrow`): `"EPISODES"` (series) or `"UP NEXT"` (movie), `fontMono 11px uppercase`, `color: colorTextMuted`, `marginBottom: 10px`.

#### Movie variant: UP NEXT rows

- Displays up to 3 videos from the library (excluding current video).
- Each row (`.upNextRow`): 3-column grid: `gridTemplateColumns: 44px 1fr 22px`, `columnGap: 10px`, `paddingTop/bottom: 8px`.
  - **Poster** (`.upNextPoster`): 44×62px thumbnail, `backgroundColor: colorBorder` (fallback), `backgroundImage: url(...)` when available.
  - **Info** (`.upNextInfo`): Flex column, `minWidth: 0` (allows ellipsis).
    - **Title** (`.upNextTitle`): `fontSize: 12px`, `color: colorText`, ellipsis on overflow.
    - **Sub** (`.upNextSub`): Year, `fontSize: 10px`, `color: colorTextMuted`, `fontMono`, `marginTop: 2px`.
  - **Play icon** (`.upNextPlay`): 22×22 circle, green-bordered chip, centered green play icon.
  - **Border**: `borderBottom: 1px solid colorBorderSoft` separates rows.
- **Empty state** (`.upNextEmpty`): When no up-next videos, displays `"Nothing added yet"` in muted text.

#### Series variant: Episodes

- Renders `<SeasonsPanel video={data} accordion activeEpisode={{seasonNumber, episodeNumber}} onSelectEpisode={onSelectEpisode} />`.
- SeasonsPanel handles season expansion, episode picker, and "NEW" badge styling.

### Footer (`.footer`)

- `paddingTop: 12px`, `paddingBottom: 12px`, `paddingLeft/right: 18px`.
- `borderTop: 1px solid colorBorderSoft`.
- `display: flex`, `columnGap: 8px`.
- **VLC button** (`.vlcBtn`): `flexGrow: 1`, transparent border, `color: colorTextDim`, `fontMono 10px uppercase`, `letterSpacing: 0.18em`.
- **Back button** (`.backBtn`): `padding: 10px 14px`, `backgroundColor: colorSurface2`, bordered, `color: colorTextDim`, `fontMono 10px uppercase`, `letterSpacing: 0.18em`.

## Behaviour

### Movie metadata display

- Header shows title, year·genre·duration meta line, and plot summary (clamped to 3 lines).
- Body displays up to 3 up-next videos from the same library (excluding the current film).
- If no up-next videos, displays empty state message.

### Series metadata display

- Header shows show name, Season N·genre·episode-duration meta line, plot (if present), and episode code + title chip.
- Body displays SeasonsPanel in accordion mode with active episode highlighting.
- No up-next section (series always show episodes).

### Episode selection

- SeasonsPanel fires `onSelectEpisode(seasonNumber, episodeNumber)` when user clicks an episode.
- PlayerContent intercepts, updates URL search params, which re-triggers series episode resolution and playback restart.

### Links and navigation

- **Up-next rows**: `<Link to="/player/{id}" replace>` — navigates to new film, `replace: true` prevents history bloat.
- **Back button**: Calls `onBack()` which triggers `goBackWithTransition()` in PlayerContent.
- **VLC button**: No-op placeholder (future: open file in external player).

## Data

- **Fragment**: Carries `id`, `title`, `durationSeconds`, `metadata { title, year, genre, plot, posterUrl }`, `library { videos(first: 6) { edges { node { id, title, metadata { year, posterUrl } } } } }`. Spreads `...SeasonsPanel_video`.
- **Derived**: Display title (metadata title or fallback), metadata line (year·genre·duration format), episode code, up-next list (library videos excluding self).

## Notes

- **Open/close state owned by parent**: PlayerSidebar is fully controlled by `open` prop and event callbacks. No internal state.
- **Episode code formatting**: Helper `formatEpisodeCode(seasonNumber, episodeNumber)` pads both to 2 digits (`S01E03`, etc.) matching VideoArea.
- **Poster background-image fallback**: Up-next and end-screen suggestions use CSS `backgroundImage` for lazy-loaded thumbnails. Fallback gradient ensures placeholder color when URL fails to load.
- **Scroll overflow**: Body section has `overflowY: auto` to enable scrolling when SeasonsPanel content exceeds available space.
- **Series vs movie branching**: The entire body section switches between SeasonsPanel and up-next rows based on `seriesPick !== null`.
