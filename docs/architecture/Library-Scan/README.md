# Library Scan

How the background scanner walks media directories, fingerprints files, and upserts DB rows — plus how the client subscribes to scan state for live UI feedback.

| File | Hook |
|---|---|
| [`00-Flow.md`](00-Flow.md) | Continuous-loop pipeline, concurrent ffprobe + content fingerprint, upsert flow, fingerprint stability across renames. |
| [`01-Filename-Conventions.md`](01-Filename-Conventions.md) | The contract between user filenames/folders and the scanner. Movie file/folder layouts, TV hierarchy, tokens stripped before OMDb lookup, examples that parse and that don't. |
| [`02-Film-Entity.md`](02-Film-Entity.md) | Logical deduplication layer for movies: one Film per movie entity with 1+ video copies. Dedup keys (imdb_id, parsed_title_key), scanner passes, role semantics (main vs extra), watchlist linking, merge flow. |
