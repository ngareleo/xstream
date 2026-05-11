# DB Schema

| File | Hook |
|---|---|
| [`00-Tables.md`](00-Tables.md) | `libraries`, `videos`, `video_streams`, `transcode_jobs`, `user_settings` — columns, constraints, indices. |

## Identity is not stored locally

`user_id` is a UUID string sourced from the Supabase JWT `sub` claim, validated server-side via the cached JWKS (see [`../../architecture/Identity/`](../../architecture/Identity/README.md)). There is **no local `users` table** in xstream's SQLite — Supabase is the source of truth.

When future tables need to reference a user (watchlist owners, playback history), the column will be a denormalised `user_id TEXT` with no FK constraint, because the backing row lives outside xstream. Peer sharing will surface this question (need to display owner metadata for remote peers); we'll introduce a synced local `users` table at that point.
