# Library Scan Flow

```
Continuous loop (every scanIntervalMs, default 30s)
      │
      ▼
loadMediaConfig() → filter by env → validate path exists
      │
      ▼
walkDirectory() → yield video file paths (async generator, depth-first)
      │
      ▼  ← for each file, launched concurrently via Promise.all
stat(filePath)
      │
      ├── ffprobe(filePath)  ─────────────────────────┐  (concurrent)
      └── computeContentFingerprint(filePath, size)  ─┘
                │
                ▼
upsertLibrary() → libraries table
upsertVideo()   → videos table   (keyed on path, includes content_fingerprint)
replaceVideoStreams() → video_streams table
```

The content fingerprint is `"<sizeBytes>:<sha1hex>"` over the first 64 KB of the file. It is stable across renames/moves and changes only when file content changes. Transcode job IDs are derived from the fingerprint rather than the file path, so the segment cache survives file renames.
