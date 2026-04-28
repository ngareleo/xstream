# fluent-ffmpeg Quirks

- **`inputOptions` takes one argv entry per array element** — split flags, don't concatenate:
  ```ts
  ["-init_hw_device", "vaapi=va:/dev/dri/renderD128", "-hwaccel", "vaapi"]
  // NOT: ["-init_hw_device vaapi=..."]
  ```

- **`-ss 0 -t SHORT` silently produces zero segments on VAAPI HDR 4K.** ffmpeg exits zero, `transcode_complete` fires with `segment_count: 0`, and no error or fallback event is emitted. The same invocation with `-t 300` works; `-ss N -t 30` for N > 0 also works. Root cause is unknown (likely flush/pipeline-depth in `tonemap_vaapi` + `scale_vaapi` + H.264 VAAPI encoder on a short window at the file head). Client workaround: `playbackController.ts` uses `clientConfig.playback.chunkDurationS` (not `clientConfig.playback.firstChunkDurationS`) when `startS === 0`. Full write-up and structural fix plan: `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md` § "VAAPI silent-success failures".

- **`setFfmpegPath` is module-global.** Only `resolveFfmpegPaths` in `ffmpegPath.ts` is allowed to call it. Any other module that imports `ffmpeg-installer` and calls `setFfmpegPath` at module-load time silently clobbers the resolver.

  Symptom: VAAPI probe fails with `-22` while a direct `bun` spawn of the same binary works.
