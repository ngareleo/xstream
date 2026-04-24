# Key Invariants — Never Violate These

1. **All SQL goes through `db/queries/`** — no `getDb().prepare(...)` calls outside that directory.
2. **GraphQL schema changes require `bun relay` in `client/`.** `__generated__/` artifacts are gitignored; a stale artifact breaks Relay queries at runtime.
3. **`SourceBuffer.appendBuffer()` must never be called while `updating === true`.** Always `await waitForUpdateEnd()` first — violation throws `InvalidStateError` and breaks MSE.
4. **Init segment is the first frame on every new stream connection.** Server sends `init.mp4` before any `.m4s`; client appends it before any media segment. Order broken = decoder can't initialise.
5. **`path` is the unique key for libraries and videos.** Two libraries can share `name`; only `path` is unique.
6. **`MediaSource.endOfStream()` must be called when streaming finishes.** `BufferManager.markStreamDone()` handles it — skipping it stalls `<video>`.
7. **Revoke object URLs on teardown.** `BufferManager.teardown()` calls `URL.revokeObjectURL()`. Always teardown on unmount or resolution switch.
8. **`content_fingerprint` is `NOT NULL`.** Old `tmp/xstream.db` without this column must be deleted and regenerated — no backward-compatible migration.
9. **Relay global IDs must be URL-encoded in route links.** Global IDs are base64 and may contain `/`, `+`, `=`. Use `encodeURIComponent(id)` on the way in, `decodeURIComponent` (or `resolveVideoId`) on the way out.
10. **One resolver owns each GraphQL field.** `@graphql-tools/schema` merges via `Object.assign` — duplicates silently overwrite. Pick one home (`video.ts` for `Video.*`, `library.ts` for `Library.*`) and keep it there.
11. **Playback-path resolvers return a typed union for known failure modes — they never throw a plain `Error`.** `startTranscode` returns `StartTranscodeResult = TranscodeJob | PlaybackError`. The resolver wraps only genuinely unexpected failures as `INTERNAL`; cap rejection, video-not-found, probe failure, and encode failure are all discriminated `PlaybackError` variants. Mid-job failures must populate `ActiveJob.errorCode` **before** calling `notifySubscribers` — the subscription delivers the final state to the client in the same push, so setting it after is a race.
