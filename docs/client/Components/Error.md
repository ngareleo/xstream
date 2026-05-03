# Error (page)

Runtime-error recovery page for displaying unexpected failures. Styled error
identity with a red left border, optional collapsible stack trace, and two
recovery CTAs ("Back to Library", "Retry"). Can be rendered in-place by an
error boundary or navigated to directly for QA visibility.

**Source:** `client/src/pages/error-page/`
**Used by:** Router as `/error` route (QA / direct navigation) and mounted
in-place by error boundary when catching unhandled exceptions.

## Role

Error presentation shell. Displays user-friendly error message, optional
technical stack trace (collapsible), and recovery options. Accepts error
details via props (from error boundary) or shows placeholder copy (when
navigated to directly for testing). Provides two recovery paths: navigate
back home or retry the failed operation.

## Props

- `error?: Error` — the caught exception object.
- `componentStack?: string` — React component stack from error boundary's
  `errorInfo.componentStack`.
- `onRetry?: () => void` — callback for the Retry button. Falls back to
  `window.location.reload()` when not provided (standalone page route).

## Layout & styles

### Page layout

- Full-screen, `display: flex`, `alignItems: center`, `justifyContent: center`,
  `backgroundColor: colorBg1`, `paddingLeft: 80px`, `paddingRight: 24px`,
  `paddingTop: tokens.headerHeight` (page respects header clearance).
- Content centred in a max-width container (ca. 560px).

### Error identity

- Red accent running vertically down the left side of the content.
  `borderLeftWidth: 4px`, `borderLeftStyle: solid`, `borderLeftColor:
  colorRed`, `paddingLeft: 28px`.

### Headline

- "Something went wrong" in Anton 64px uppercase, `color: colorText`.
- `marginBottom: 16px`.

### Subhead / description

- 14px body font, `color: colorTextDim`, `lineHeight: 1.6`.
- Message: User-friendly interpretation of the error (production). Placeholder
  text when rendered standalone: "An unexpected error occurred. Please try
  again or contact support if the problem persists."
- `marginBottom: 28px`.

### Stack trace box (when visible, collapsible)

- `backgroundColor: colorSurface`, `border: 1px solid colorBorder`,
  `borderRadius: radiusSm`, `padding: 12px`.
- Mono 10px, `color: colorTextDim`, `lineHeight: 1.8`.
- Renders: `${error.name}: ${error.message}\n\n${error.stack}\n\n${componentStack}`.
- Collapsible toggle: "Show details" / "Hide details" with chevron icon.
  Defaults to hidden; expanding shows full stack.
- `marginBottom: 28px`.

### CTA buttons

- Flex row, `columnGap: 16px`, `marginBottom: 0`.
- **"← Back to Library"** (secondary): Text action style (white text + white
  underline), `<a href="/">` (not `<Link>` — error boundary may mount above
  Router context). `onClick={() => onRetry?.() || window.location.reload()}`.
- **"Retry"** (primary): Text action style (green text + green underline),
  `<button onClick={onRetry || () => window.location.reload()}>`.

## Behaviour

### Error presentation

- When mounted by error boundary: receives `error` and `componentStack` props,
  displays real exception details.
- When navigated to directly (`/error` route): no props, displays placeholder
  copy and disabled Retry button (or "Reload" fallback).
- Stack trace defaults to hidden (collapsed); user can expand via toggle.

### Recovery callbacks

- **Retry**: calls `onRetry()` if provided, falls back to
  `window.location.reload()`.
- **Back to Library**: `<a href="/">` for out-of-Router safety. Ensures the
  link works even if error boundary caught above the Router subtree.

## Notes

- **Outstanding work**: Outstanding work tracked in
  [`Outstanding-Work.md`](../../release/Outstanding-Work.md#error).
- **Error context**: Error details can be passed via props (error boundary
  render) or extracted from location state (if navigated to). Current
  production uses the error-boundary in-place render.
- **Stack trace formatting**: Full stack is shown when expanded. Long stacks
  are truncated only if needed (no artificial length limit).
- **User-friendly messages**: Production should map technical error codes to
  plain-language copy (e.g., "Stream not found" → "This file couldn't be
  played. Try a different resolution or file.").
- **Retry semantics**: The Retry button's action depends on the failed
  operation. In some cases, retrying means re-running a GraphQL query; in
  others, it means navigating back and letting the user try a different
  action. Define this clearly in the error context integration.
