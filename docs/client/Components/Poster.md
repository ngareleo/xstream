# Poster

Image wrapper that renders a poster URL with a graceful fallback to a gradient placeholder when the image fails to load or when no URL is supplied.

**Source:** `client/src/components/poster/`
**Used by:** `FilmTile` (poster cards), detail pages, any context requiring poster imagery.

## Role

Presentational image container for posterUrl values. When a URL is provided and loads successfully, renders the image. On load failure or missing URL, falls back to a styled gradient placeholder with an ellipsized label. Poster sizing is handled entirely at the GraphQL fragment level — callers select the appropriate `posterUrl(size: <PosterSize>)` argument and pass the resolved URL to this component.

## Props

| Prop | Type | Notes |
|---|---|---|
| `url` | `string \| null` | Poster URL. Two shapes: an absolute OMDb URL (e.g. `https://m.media-amazon.com/…`) or a server-relative `/poster/<basename>.w{N}.webp` URL pointing at the sized local cache. |
| `alt` | `string` | Fallback label text (also image `alt` attr). |
| `className` | `string` | Griffel merged classes. Callers supply geometry via `className`. |

## Layout & styles

### Image (success path)

- `<img src={url} alt={alt} className={className}>`.
- `objectFit: cover` and `display: block` are baked into the Griffel class; no inline `style` prop.
- Lazy loading enabled (`loading="lazy"`).

### Fallback (no `url` OR `errored`)

- `<div className={className}>` with `linear-gradient(160deg, colorSurface2, colorBg0)` background via Griffel.
- `display: flex`, centred.
- Label: the `alt` text (or literal `"poster"`) in JetBrains Mono 10px / 0.2em letter-spacing / uppercase / `color: colorTextFaint`.

### Geometry

- The component accepts only `className` (no `style` prop). Callers supply width, height, and `objectFit` overrides via their own Griffel classes passed as `className`. This matches the `mergeClasses` convention used throughout the client.

## Behaviour

- Internal state: `errored: boolean`, default `false`.
- `onError={() => setErrored(true)}` on the `<img>` sets the error state once.
- When `url` changes, the `errored` state resets to `false` via `useEffect(() => setErrored(false), [url])` so re-renders with new URLs don't stay stuck in the error state.

## Data

No fragment dependencies — `url` and `alt` are passed as props from the parent (sourced from `metadata.posterUrl` on Film, Show, or Video).

## URL resolution

The component runs the URL through one helper before rendering:

**`resolvePosterUrl(url)` from `~/config/rustOrigin`** — server-relative paths starting with `/poster/` are prefixed with `HTTP_ORIGIN` (the GraphQL server's port — 3002 in dev, the Tauri-injected port in prod) so the dev client (different port from the server) can fetch them. Absolute URLs pass through unchanged.

The server delivers correctly-sized bytes (WebP-encoded variants at the requested dimension), so the client no longer needs to rewrite CDN URLs for size modifiers.

## Notes

The `mergeClasses` pattern keeps styling flexible — callers compose their own geometry classes and pass them to the component, avoiding a prop-explosion for every dimension variant.

See [`docs/architecture/Library-Scan/05-Poster-Caching.md`](../../architecture/Library-Scan/05-Poster-Caching.md) for the local-cache pipeline.
