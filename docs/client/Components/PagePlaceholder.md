# PagePlaceholder

Simple fallback screen shown for incomplete pages during ongoing redesigns.
Displays the page name and target milestone.

**Source:** `client/src/components/page-placeholder/`
**Used by:** Pages under migration that don't have production UI yet.

## Role

Placeholder for work-in-progress pages. Shows a "coming in {milestone}" message
to indicate the page is planned but not yet available.

## Props

| Prop | Type | Notes |
|---|---|---|
| `name` | `string` | Page name (e.g., "Watchlist", "Settings"). |
| `milestone` | `string` | Target release (e.g., "M2", "M3"). |

## Layout & styles

- `paddingTop: calc(headerHeight + 64px)`, `paddingLeft/Right/Bottom: space5`.
- `display: flex`, `flexDirection: column`, `alignItems: center`, `justifyContent: center`.
- `height: 100%`, `boxSizing: border-box`, `color: colorTextDim`.

### Eyebrow

- `fontFamily: fontMono`, `fontSize: 10px`, `letterSpacing: 0.28em`, `textTransform: uppercase`.
- `color: colorTextFaint`, `marginBottom: space3`.
- Text: "release-design migration".

### Title

- `fontFamily: fontHead`, `fontSize: 48px`, `letterSpacing: 0.04em`, `color: colorText`.
- `marginBottom: space2`.
- Displays the `name` prop.

### Body

- `fontFamily: fontMono`, `fontSize: 12px`, `letterSpacing: 0.16em`, `textTransform: uppercase`.
- `color: colorTextMuted`.
- Format: "coming in {milestone}".

## Notes

- Temporary; will be removed after all pages migrate to release design.
- Purely presentational; no interactivity.
