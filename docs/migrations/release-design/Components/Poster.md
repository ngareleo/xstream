# Poster

> Status: **baseline** (Spec) · **not started** (Production)

## Files

- `design/Release/src/components/Poster/Poster.tsx` (no `.styles.ts` — inline `CSSProperties`)
- Prerelease behavioural reference: `design/Prerelease/src/components/Poster/`

## Purpose

Image wrapper that renders an OMDb (or other CDN) poster URL with a graceful fallback to a gradient placeholder when the image fails to load or when no URL is supplied.

## Visual

### Image (default path)
- `<img src={url} alt={alt} className={className}>`.
- Inline style: `objectFit: cover`, `display: block`, then `...style` (caller can override).

### Fallback (no `url` OR `errored`)
- `<div>` with `linear-gradient(160deg, var(--surface-2), var(--bg-0))` background.
- `display: flex`, centred.
- Label: the `alt` text (or literal `"poster"`) in JetBrains Mono 10px / 0.2em letter-spacing / uppercase / `color: var(--text-faint)`.
- Spreads `...style` last so callers can resize.

## Behaviour

- Internal state: `errored: boolean`, default `false`.
- `onError={() => setErrored(true)}` on the `<img>` flips the state once.
- **The state does not reset on URL change.** A re-render with a new `url` prop will keep `errored = true` from the previous URL — see TODO.

## Subcomponents

None.

## TODO(redesign)

- `errored` state should reset when `url` changes — currently stuck after a single failure (use `useEffect(() => setErrored(false), [url])` or key the component by url).
- No `loading="lazy"` attr — every poster fires immediately. Add lazy loading for grid views.
- No accessible width/height (CLS not constrained). Pass dimensions through props or via parent's container styling.

## Porting checklist (`client/src/components/Poster/`)

- [ ] `<img>` with onError fallback to gradient placeholder
- [ ] Fallback gradient: `linear-gradient(160deg, surface-2, bg-0)`
- [ ] Fallback label: alt text in Mono 10px uppercase / 0.2em / `text-faint`
- [ ] `objectFit: cover`, `display: block` defaults; caller `style` overrides
- [ ] **Reset `errored` state on URL change** (fix the TODO at port time)
- [ ] Add `loading="lazy"` for grid usage
- [ ] Forward `className` through both branches

## Status

- [ ] Designed in `design/Release` lab (baseline reflects current state)
- [ ] Production implementation
