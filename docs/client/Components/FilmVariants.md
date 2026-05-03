# FilmVariants

Dropdown selector that surfaces multiple video copies of the same film when more than one exists. Rendered inside `FilmDetailsOverlay` when `copies.length > 1`. Lets the user choose which encoding to play (e.g., "BluRay 4K" vs "Web 1080p").

**Source:** `client/src/components/film-variants/`
**Used by:** `FilmDetailsOverlay` (when film has multiple main-role copies).

## Role

File variant picker for films with multiple encodes. Displayed only when a film owns 2+ videos with `role='main'`. Renders a glass dropdown showing each copy's resolution, codec, bitrate, and file size, and fires a callback when the user selects one.

## Props

| Prop | Type | Notes |
|---|---|---|
| `copies` | `FilmCopyNode[]` | Array of video copies; each carries resolution, codec, bitrate, fileSize, and a stable ID. |
| `selectedCopyId` | `string` | The currently selected copy's video ID. Used to highlight the active option. |
| `onSelectCopy` | `(videoId: string) => void` | Fired when the user picks a different copy from the dropdown. |

### `FilmCopyNode` shape

```typescript
{
  id: string;                    // video.id (global Relay ID)
  resolution: string;            // '240p' | '360p' | '480p' | '720p' | '1080p' | '4k'
  codec: string;                 // e.g., 'h264', 'hevc'
  bitrate: number;               // in bps
  fileSize: number;              // in bytes
  title: string;                 // friendly label; e.g., "BluRay 4K" or filename
}
```

## Layout & styles

### Container (`.variantsWrapper`)

- `position: relative`, inline-block within `FilmDetailsOverlay.overlayContent`.
- `width: auto` — sized to fit the dropdown trigger + menu.

### Trigger button

- 38×38 square, `borderRadius: 4px`.
- `backgroundColor: rgba(0,0,0,0.45)`, `borderColor: tokens.colorBorder`, 1px solid.
- Contains a badge label showing the **selected copy's resolution** (e.g., "4K", "1080p") in Mono 11px, centered.
- Hover: `backgroundColor: rgba(0,0,0,0.7)`, border + text → `tokens.colorGreen`.
- On click: dropdown menu opens below the button.

### Dropdown menu (`.variantsMenu`)

- `position: absolute`, `top: 44px` (below trigger), `right: 0`.
- `backgroundColor: rgba(20,28,24,0.85)`, `backdropFilter: blur(10px) saturate(1.4)`, `borderRadius: 4px`, `border: 1px solid rgba(37,48,42,0.45)`.
- `minWidth: 280px`, `maxHeight: 320px`, `overflowY: auto`.
- Shadow: `0 4px 12px rgba(0,0,0,0.4)`, `zIndex: 20` (above FilmDetailsOverlay content).

### Option row

- `padding: 12px 16px`, `display: flex`, `alignItems: center`, `columnGap: 12px`.
- `color: tokens.colorTextMuted`, Mono 12px, `lineHeight: 1.4`.
- Hover: `backgroundColor: rgba(37,48,42,0.5)`, `color: tokens.colorText`.
- Active (matches `selectedCopyId`): `backgroundColor: rgba(76,158,102,0.25)`, `color: tokens.colorGreen`, with a left border accent (`borderLeftColor: tokens.colorGreen`, `borderLeftWidth: 3px`, `paddingLeft: 13px`).
- Cursor: `pointer`.

### Option content

- **Resolution badge** (left, 28×28 circle): `backgroundColor: tokens.colorGreen`, `borderRadius: 50%`, centered text (e.g., "4K") in white, bold, 12px.
- **Text stack** (flex: 1): title (Mono 12px, main line) + metadata (Mono 11px, muted, second line: "2160p HEVC, 12 Mbps, 4.2 GB").

## Behaviour

- **Initial state:** dropdown closed.
- **Click trigger:** opens dropdown menu, displays all copies sorted by resolution (highest first).
- **Select option:** calls `onSelectCopy(videoId)`, closes dropdown, updates `selectedCopyId` (prop re-render highlights the new active option).
- **Click outside:** closes dropdown (standard popover dismiss, e.g., via `useEffect` with a `click` listener on `document`).
- **Keyboard (optional, nice-to-have):** `Escape` closes, arrow keys navigate options, `Enter` selects, but basic click-based interaction is sufficient for MVP.

## Data

No Relay fragments — copies data is passed in props from `FilmDetailsOverlay`, which fetches the `Film` fragment with a nested `copies` array. This component is purely presentational; it doesn't query.

## Notes

**Visibility rule:** Only rendered when `copies.length > 1`. If the film has a single video (most common case), `FilmVariants` is not mounted.

**Sort order:** Copies are pre-sorted by the `Film.copies` resolver (role, then resolution, then bitrate). The dropdown displays them in that order with the first as the default selection in `FilmDetailsOverlay`.

**Integration with FilmDetailsOverlay:** The parent overlay maintains `selectedCopyId` state and passes it down. When the Play CTA is clicked, the selected copy's video ID is used to start transcoding (not the default bestCopy). If the user never opens the variant picker, `selectedCopyId` defaults to `bestCopy.id`.
