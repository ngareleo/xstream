# Poster

> Status: **done** (Spec) · **done** (Production)

## Files

- `design/Release/src/components/Poster/Poster.tsx`
- `design/Release/src/components/Poster/Poster.styles.ts`
- Prerelease behavioural reference: `design/Prerelease/src/components/Poster/`

## Purpose

Image wrapper that renders an OMDb (or other CDN) poster URL with a graceful fallback to a gradient placeholder when the image fails to load or when no URL is supplied.

## Visual

### Image (default path)
- `<img src={url} alt={alt} className={className}>`.
- `objectFit: cover` and `display: block` are baked into the Griffel class; no inline `style` prop.

### Fallback (no `url` OR `errored`)
- `<div className={className}>` with `linear-gradient(160deg, var(--surface-2), var(--bg-0))` background via Griffel.
- `display: flex`, centred.
- Label: the `alt` text (or literal `"poster"`) in JetBrains Mono 10px / 0.2em letter-spacing / uppercase / `color: var(--text-faint)`.

### Public API — geometry is the caller's responsibility
- `Poster` accepts only `className` (no `style` prop). Callers supply geometry (width, height, `objectFit` overrides) via their own Griffel classes passed as `className`. This matches the `mergeClasses` convention used by the rest of the lab.

## Behaviour

- Internal state: `errored: boolean`, default `false`.
- `onError={() => setErrored(true)}` on the `<img>` flips the state once.
- **The state does not reset on URL change.** A re-render with a new `url` prop will keep `errored = true` from the previous URL — see TODO.

## Subcomponents

None.

## Changes from Prerelease

No Prerelease counterpart — `<Poster>` is a new component in the Release redesign. In Prerelease, poster images were simulated by CSS gradient strings in the `Film.gradient` field (e.g. `linear-gradient(160deg, #0d1b2a, #1b2838)`); no `<img>` element was rendered. Release replaces gradient placeholders with real OMDb-fetched JPGs served from `/posters/<id>.jpg`, requiring a proper image wrapper with an error-fallback path.

Cross-reference: [`Changes.md`](../Changes.md) — "Poster" entry.

## TODO(redesign)

- `errored` state should reset when `url` changes — currently stuck after a single failure (use `useEffect(() => setErrored(false), [url])` or key the component by url).
- No `loading="lazy"` attr — every poster fires immediately. Add lazy loading for grid views.
- No accessible width/height (CLS not constrained). Pass dimensions through props or via parent's container styling.

## Porting checklist (`client/src/components/poster/`)

- [x] `<img>` with onError fallback to gradient placeholder
- [x] Fallback gradient: `linear-gradient(160deg, surface-2, bg-0)`
- [x] Fallback label: alt text in Mono 10px uppercase / 0.2em / `text-faint`
- [x] `objectFit: cover` + `display: block` baked in Griffel; **no `style` prop** — callers supply geometry via `className`
- [x] **Reset `errored` state on URL change** (fix the TODO at port time) — `useEffect(() => setErrored(false), [url])`
- [x] Add `loading="lazy"` for grid usage
- [x] Forward `className` through both `<img>` and fallback `<div>` branches via `mergeClasses`

## Status

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [x] Production implementation
