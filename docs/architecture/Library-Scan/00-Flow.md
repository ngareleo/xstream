# Library Scan Flow

```
Continuous loop — spawn_periodic_scan ticks every scan_interval_ms (default 30 s)
      │
      ▼
get_all_libraries(&db) → filter to libraries whose path resolves
      │
      ▼
walkdir::WalkDir(library.path) → iterate video file paths
      │
      ▼  ← for each file, joined concurrently via tokio::task::JoinSet
fs::metadata(file_path)
      │
      ├── FfmpegFile::probe(file_path)  ──────────────┐  (concurrent)
      └── compute_content_fingerprint(file_path, size) ┘
                │
                ▼
upsert_library() → libraries table
upsert_video()   → videos table   (keyed on path, includes content_fingerprint)
replace_video_streams() → video_streams table
```

`scan_libraries(&AppContext)` is the public entry; `spawn_periodic_scan(AppContext)` wraps it in a tokio interval task. Both live in `server-rust/src/services/library_scanner.rs`.

The content fingerprint is `"<size_bytes>:<sha1hex>"` over the first 64 KB of the file (`FINGERPRINT_BYTES`). It is stable across renames/moves and changes only when file content changes. Transcode job IDs are derived from the fingerprint rather than the file path, so the segment cache survives file renames.
