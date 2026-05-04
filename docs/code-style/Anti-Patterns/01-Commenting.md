# Commenting Policy

Code is read more often than it is written. Comments either earn their keep or rot in place. This doc defines what earns its keep in xstream and what does not.

The default is **no comment**. The bar to add one is *"a future reader needs context that the code itself cannot communicate."*

## When a comment is acceptable

### Type and interface documentation

`/** ... */` (TypeScript) and `///` / `//!` (Rust) on **public surface** are always acceptable and often required:

- TS: every exported type, interface, function signature, hook, service method.
- Rust: every `pub` item; every module entry (`//!` at the top of `mod.rs` / `lib.rs`).

Keep them terse. One sentence on what the symbol *is* — not how it's used, not why it exists, not the history of its design.

```ts
/** Decoded transcode-job ID. Numeric local ID, not the Relay global ID. */
export type LocalJobId = number;
```

```rust
/// Reads the trailing fragment of an in-progress fMP4 file produced by ffmpeg.
///
/// Designed for ffmpeg's `+frag_keyframe` output where the file is appended
/// to in real time and the tail is the only readable region.
pub struct FmP4TailReader { /* ... */ }
```

### "Why" comments at non-obvious points

A `//` comment is acceptable when it explains something a reader cannot derive from the code plus reasonable external knowledge. Examples that earn the comment:

- **Browser / codec / hardware quirks** — Chromium MSE behaviours, VAAPI driver bugs, ffmpeg flag interactions.
- **Race conditions and ordering invariants** — *why* this `await` must happen before that one, *why* this state is captured at construction time and not at use.
- **Protocol gotchas** — wire-level quirks (length-prefix off-by-one, CMAF `tfdt` semantics).
- **References to traced incidents** — `// see trace 8c10bcac in Seq` is load-bearing evidence; keep the trace ID.
- **Magic-number rationale** — paired with a named constant, the comment justifies the number. (Keeps the existing rule from [`00-What-Not-To-Do.md`](00-What-Not-To-Do.md).)
- **Performance trade-offs** — *why* the obviously-cleaner version was rejected.
- **Hardware-acceleration fallbacks** — *why* a particular path exists and what it falls back to.

Lead with **why**, not **what**. If you find yourself describing what the next line of code does, delete the comment.

```ts
// Snapshot at construction — caller mutates the array after handing it to us.
const initial = [...input];
```

```rust
// VAAPI surface count must be at least pool_size + 2: one for the encoder
// in flight, one for the next frame queueing, and the rest for the pool.
let surface_count = pool_size + 2;
```

### Required markers

- `// SAFETY:` directly above every `unsafe { }` block. Mandatory.
- `// SAFETY:` on `unsafe impl`. Mandatory.

### Test rationale

`// Skipped — see <docs path>` style comments next to skipped tests. See [`../Testing/00-Tests-Travel-With-The-Port.md`](../Testing/00-Tests-Travel-With-The-Port.md).

## When a comment is not acceptable

### Banner separators

Delete on sight:

```ts
// ─── Setup ─────────────────────────────
// === helpers ===
// --- internal ---
```

If a section header feels needed, the file is too big — split it.

### "What" comments

Delete on sight. The code already says what; comments must say *why*.

```ts
// BAD — restates the line below
// Initialize the buffer manager
const buffer = new BufferManager();
```

### Commented-out code

Delete. Git history is the archive. If you might need it back, write it as a TODO with an issue ref or a feature flag.

### File-top boilerplate

No copyright headers. No "this file…" prologues. The file's name and its rustdoc / TSDoc on its main export do that work.

### Multi-paragraph narrative prose

If a `//` comment runs longer than ~3 lines and reads like documentation, it is documentation — and it belongs in `docs/`. Move it.

### Bare TODOs

`// TODO` without an owner and an issue or PR reference is dead weight. Either:
- Add owner + ref: `// TODO(@ngareleo, #123): swap once OMDb has IMDb fallback.`
- Or delete it.

### Comments that reference the current task or PR

`// added for the watchlist feature`, `// fix for issue #42` — these are PR-description content. Comments that point at "now" rot the moment "now" passes.

## Relocate, don't delete, when prose is valuable

Some comments encode genuine architectural knowledge. They earn their place — in `docs/`, not in code.

When you find a long-form comment whose content is:

- Architectural rationale (why the system is shaped this way)
- A traced-incident postmortem (chunked failure mode, recovery path)
- A protocol explainer
- A historical decision with current-day implications

Move it:

1. Find the matching subtree under `docs/` (architecture, server, client, code-style).
2. Either extend an existing doc or add a new one under the right concept folder, following [`../Naming/00-Conventions.md`](../Naming/00-Conventions.md).
3. Replace the comment in the code with a one-line cross-reference:

```ts
// See docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md §"Chromium MS-ended recovery".
```

```rust
// See docs/server/FFmpeg-Caveats/03-Encode-Flags.md.
```

4. If the prose referenced a Seq trace ID, copy the trace ID into the doc — it's searchable evidence.

## Language quick-reference

| Surface | TypeScript | Rust |
|---|---|---|
| Module-level docs | First-export TSDoc / file purpose at top of `index.ts` if needed | `//!` at top of `mod.rs` / `lib.rs` |
| Public type / function | `/** terse description */` | `/// terse description` |
| `unsafe { }` | n/a | `// SAFETY: ...` (mandatory) |
| Why-comment in body | `// short why-only sentence` | `// short why-only sentence` |
| Banner separators | none | none |
| Commented-out code | none | none |
| Long-form prose | move to `docs/`, leave one-line xref | move to `docs/`, leave one-line xref |

## Enforcement

This policy is reviewed at PR time. There is no linter rule that catches "this comment restates the code"; a reviewer's read is the gate. When you touch a file, leave its comments at least as good as you found them.

The boot pack in `CLAUDE.md` routes agents to `docs/code-style/`; this doc is the canonical reference for both human and agent contributors.
