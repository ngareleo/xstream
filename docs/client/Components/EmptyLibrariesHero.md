# EmptyLibrariesHero

Full-viewport empty state shown on library and profiles pages when no libraries
or profiles have been created yet. Features a large headline, descriptive copy, and
a call-to-action button to create the first profile. The component accepts a
watermark prop to contextualize the empty state per page (e.g., "library" or
"profiles").

**Source:** `client/src/components/empty-libraries-hero/`
**Used by:** `HomePageContent` and `ProfilesPageContent` (conditional render
when no libraries/profiles exist).

## Role

Presentational hero for onboarding. Drives navigation to `/profiles/new` with a
return-to URL encoded in the query string so the user lands back on the empty
page after creating their first profile.

## Props

| Prop | Type | Notes |
|---|---|---|
| `watermark` | `string` | Text displayed as a large faint background watermark (e.g., "library", "profiles"). Used to contextualize the empty state per page. |

## Layout & styles

### Container

- `position: relative`, `flexGrow: 1`, `height: 100%`, `width: 100%`.
- `display: flex`, `alignItems: center`, `justifyContent: flex-start`.
- `paddingLeft: 80px`, `paddingTop: calc(headerHeight + 48px)`.
- Background: radial dot pattern (`backgroundImage: radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)`, `backgroundSize: 28px 28px`).

### Watermark

- `position: absolute`, `bottom: -60px`, `right: -60px`.
- `fontFamily: fontHead`, `fontSize: 340px`, `lineHeight: 1`.
- `color: rgba(255,255,255,0.022)`, `textTransform: uppercase`.
- `pointerEvents: none`, `userSelect: none`.

### Content column

- `position: relative`, `zIndex: 1`.
- `display: flex`, `flexDirection: column`, `rowGap: 20px`.

### Eyebrow

- `fontFamily: fontMono`, `fontSize: 10px`, `letterSpacing: 0.22em`.
- `color: colorGreen`, `textTransform: uppercase`.
- Text: "· no libraries yet".

### Headline

- `fontFamily: fontHead`, `fontSize: 96px`, `lineHeight: 0.9`, `letterSpacing: 0.01em`.
- Two spans: "your collection" (colorText) + "starts here." (colorGreen).
- `textTransform: uppercase`.

### Divider rule

- `width: 56px`, `height: 3px`.
- `backgroundColor: colorGreen`, `borderRadius: 2px`.

### Body text

- `fontSize: 14px`, `lineHeight: 1.65`, `color: colorTextDim`.
- `maxWidth: 360px`, `fontFamily: fontBody`.
- Text: "Point Xstream at a folder of films or shows. We'll scan recursively, match titles against OMDb, and pull posters."

### Actions row

- `display: flex`, `alignItems: center`, `columnGap: 20px`, `marginTop: 8px`.

### CTA link

- `color: colorGreen`, `background: transparent`, `border: none`.
- `fontFamily: fontMono`, `fontSize: 12px`, `letterSpacing: 0.18em`.
- `textTransform: uppercase`, `textDecorationLine: underline`, `textDecorationColor: colorGreen`, `textUnderlineOffset: 5px`.
- Hover: `color: colorText`, `textDecorationColor: colorText`.
- Text: "+ Create your first profile".

### Hint

- `fontFamily: fontMono`, `fontSize: 10px`, `letterSpacing: 0.12em`.
- `color: colorTextFaint`, `textTransform: uppercase`.
- Text: "⌘ N · paths can be local or networked".

## Behaviour

- Rendered unconditionally by parent pages when `libraries.length === 0`.
- CTA link navigates to `/profiles/new?return_to={encodedCurrentUrl}`.
- URL encoding ensures the return destination survives HMR and page refresh.

## Notes

- Storybook stories showcase both "profiles" and "library" watermark variants.
- Component is stateless; all navigation is delegated to React Router Link.
