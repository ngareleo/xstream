# Library Scan

How the background scanner walks media directories, fingerprints files, and upserts DB rows — plus how the client subscribes to scan state for live UI feedback.

| File | Hook |
|---|---|
| [`00-Flow.md`](00-Flow.md) | Continuous-loop pipeline, concurrent ffprobe + content fingerprint, upsert flow, fingerprint stability across renames. |
