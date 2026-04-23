# fluent-ffmpeg Quirks

- **`inputOptions` takes one argv entry per array element** — split flags, don't concatenate:
  ```ts
  ["-init_hw_device", "vaapi=va:/dev/dri/renderD128", "-hwaccel", "vaapi"]
  // NOT: ["-init_hw_device vaapi=..."]
  ```

- **`setFfmpegPath` is module-global.** Only `resolveFfmpegPaths` in `ffmpegPath.ts` is allowed to call it. Any other module that imports `ffmpeg-installer` and calls `setFfmpegPath` at module-load time silently clobbers the resolver.

  Symptom: VAAPI probe fails with `-22` while a direct `bun` spawn of the same binary works.
