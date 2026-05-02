# What Not To Do

- **No ORM.** Raw SQL via `rusqlite` only.
- **No ad-hoc SQL** outside `server-rust/src/db/queries/`.
- **No server framework** beyond async-graphql + axum. Routing is explicit, not auto-discovered.
- **No global mutable state** outside `db/`, `job_store.rs`, `scan_state.rs`.
- **No base64 / text encoding** of video data — binary framing (length-prefixed raw bytes) stays; JSON overhead at 4K is unacceptable.
- **Don't call `appendBuffer` in a loop without awaiting `updateend`** — queue via `BufferManager.appendSegment()`.
- **No non-null assertions (`!`).** Use `?.` or explicit `if` guards.
- **No callback props for user actions.** Use `@nova/react` eventing. Data-flow props (fragment keys, `resolution`, `status`) are still plain props.
- **One `NovaEventingProvider` at the app root** — deeper providers fragment the event graph. Intermediate parents intercept.
- **No literal `className` strings.** All styles go through Griffel; consume via `const styles = useComponentNameStyles()`.
- **No duplicate resolver definitions.** async-graphql catches this at compile time, so duplicates are impossible.
- **No unencoded Relay IDs in route links.**
- **No plain-string `*.strings.ts` exports.** Use `LocalizedStrings`.
- **Icons use the `base()` helper** (`client/src/lib/icons.tsx`). Known exceptions: `IconEdit` (20×20 artboard), `IconSpinner` (inline animation). New exceptions need a comment explaining why.
- **No magic numbers.** Extract named constants with a comment. Group related constants and describe the behaviour they control.
- **No comments that restate code or reference the current task** (see the top-level "Don't write comments" rule in the harness default prompt).
