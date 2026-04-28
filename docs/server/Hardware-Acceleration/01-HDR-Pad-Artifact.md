# HDR encoding on VAAPI

How the chunker transcodes HDR10 / HLG / Dolby-Vision 4K sources to 8-bit H.264 SDR on Intel VAAPI without green bars, decoder errors, or silent software fallback.

The original title of this file was "HDR Pad Artifact" because the first symptom that surfaced was a green overlay caused by `pad_vaapi` on BT.2020 content. The full picture turned out to be broader — tonemap, surface tagging, and a three-tier fallback cascade — so this file now covers the whole HDR/VAAPI path.

## Symptoms and their root causes

| Symptom | Cause |
|---|---|
| Green or pink overlay on 4K HDR playback via VAAPI (SDR renders cleanly) | `pad_vaapi` fill color is interpreted in the output color space; on BT.2020 surfaces, `color=black` becomes chroma green |
| Encoder exits with libva `-38` ("Function not implemented") at the pad or encoder boundary | `pad_vaapi` rejects surfaces downstream of an HDR/DV source on the current driver stack (empirically, on every chunk) |
| Encoder exits with libva `-38` even after dropping `pad_vaapi` | `-colorspace bt709 -color_primaries bt709 -color_trc bt709` as output flags forces ffmpeg to insert an auto-scaler to bridge the surface's inherited BT.2020 metadata to the tagged BT.709 output — libva rejects the bridge in the encode pipeline |
| `transcode_fallback_to_software` event fires on every HDR chunk; `hwaccel: software` on `transcode.job` span | Any of the above not handled; the 3-tier cascade fell through to libx264 (which stalls continuously at 4K) |
| `transcode.job` ends `cleanly` with `segment_count: 0` after a short wallclock — no error event, no fallback. Specifically `-ss 0 -t 30` on VAAPI HDR 4K. Same file at `-ss 0 -t 300` works (150 segments); `-ss N -t 30` for N > 0 also works. | Unknown — likely a flush/pipeline-depth interaction between `tonemap_vaapi` + `scale_vaapi` + the H.264 VAAPI encoder when the input window is short and starts at the file head. Reproduced in traces `1bac05bd…`, `b3dbbc34…`, `3d0f0d6f…`. ffmpeg `stderr` is not captured in the OTel pipeline today, so the failure is silent. Workaround in client: `client/src/services/playbackController.ts` forces `clientConfig.playback.chunkDurationS` instead of `clientConfig.playback.firstChunkDurationS` whenever `startS === 0` (cold-start, MSE recovery at currentTime < 300, seek-to-0). Mid-file seeks (`startS > 0`) keep the small-window optimization. |

## Current implementation

Two filter-chain variants (`vaapiVideoOptions` in `server/src/services/ffmpegFile.ts`), selected by the `isHdr` flag from `ffprobe` metadata:

**SDR path:**
```
scale_vaapi=W:H:force_original_aspect_ratio=decrease:format=nv12,
pad_vaapi=W:H:x:y
```

**HDR path:**
```
tonemap_vaapi=format=nv12:t=bt709:m=bt709:p=bt709,
scale_vaapi=W:H:force_original_aspect_ratio=decrease:format=nv12:
  out_color_matrix=bt709:out_color_primaries=bt709:out_color_transfer=bt709:out_range=tv
```

Key differences for HDR:

1. **`tonemap_vaapi` does the real color conversion on the GPU** (BT.2020 → BT.709, HDR → SDR). Must come before `scale_vaapi`.
2. **No `pad_vaapi` for HDR** — the driver rejects the padded surface downstream. HDR output may have variable dimensions (e.g. 3840×1604 for 2.39:1), handled transparently by the `<video>` element's `object-fit: contain`.
3. **Tag the surface via `scale_vaapi out_color_*`** — this flows the BT.709 metadata through the encoder's VUI without any bridging scaler. DO NOT set `-colorspace bt709 -color_primaries bt709 -color_trc bt709` as output flags (tried in commit `cf6b6c1`, confirmed to break every HDR encode — see the "libva `-38`" row in the symptoms table).

## VAAPI silent-success failures — outside the cascade

The three-tier cascade in `chunker.ts` only catches **encoder errors with non-zero exit codes**. There is a second class of VAAPI failure that bypasses it entirely: ffmpeg exits zero, `transcode_complete` fires, but `segment_count: 0`. No error event, no fallback, no retry.

Known instance: `-ss 0 -t 30` on VAAPI HDR 4K (reproduced traces `1bac05bd…`, `b3dbbc34…`, `3d0f0d6f…`). The same file works at `-ss 0 -t 300` and at `-ss N -t 30` for N > 0. Root cause is unknown — likely a flush/pipeline-depth interaction between `tonemap_vaapi` + `scale_vaapi` + H.264 VAAPI encoder on a short window starting at the file head. ffmpeg stderr is not captured in OTel today, so the cause remains opaque.

**Current workaround (client-side):** `playbackController.ts` forces `clientConfig.playback.chunkDurationS` (300 s) instead of `clientConfig.playback.firstChunkDurationS` (30 s) whenever `startS === 0` — i.e. cold start, MSE recovery at `currentTime < 300`, and seek-to-0. Mid-file seeks (`startS > 0`) keep the small-window optimization.

**Cost of the workaround:** cold-start eager-prefetch is disabled; chunk N+1 won't fire until ~210 s into chunk N. Mid-file seeks are unaffected.

**Structural fix (tracked as OBS-STDERR-001 in `docs/todo.md`):** capture ffmpeg stderr in the `transcode.job` span (a `stderr_tail` attribute already exists for cascade-error events but not for `transcode_complete`), then detect `segment_count == 0` after a clean exit and force the cascade to fall through to the next tier.

## Three-tier failure cascade

`server/src/services/chunker.ts::runFfmpeg` retries each chunk on encoder failure, walking down a cascade of fallback strategies:

1. **Fast VAAPI** — the filter chain above.
2. **VAAPI with sw-pad** — HW decode + HW scale, CPU padding (`hwdownload,format=nv12,pad=...,hwupload`). Only attempted for SDR — HDR sources skip this tier because `pad_vaapi` failures tend to mean the whole surface-handling path is unhappy, and sw-pad's `hwupload` fails on the CPU NV12 it produces.
3. **Software libx264** — final fallback. `hwaccel.forced_software: true` on the resulting `transcode.job` span.

Each tier-transition emits events:
- `transcode_fallback_to_vaapi_sw_pad` — tier 1 failed, retrying on tier 2. Attaches `ffmpeg_exit_code` + `ffmpeg_stderr` (4 KB tail).
- `transcode_fallback_to_software` — tier 2 failed (or skipped), retrying on tier 3. Same failure-diagnostic attachments.

The span for the failed tier ends at the failure event; a fresh `transcode.job` span covers the retry. A single chunk that falls through to software therefore produces two sibling spans with different `hwaccel` attributes — useful for spotting intermittent HW failures in traces.

## Per-source VAAPI-state cache

`chunker.ts` keeps an in-memory `vaapiVideoState: Map<string, "needs_sw_pad" | "hw_unsafe">` keyed by `video_id`:

- **First failure** on a source → state becomes `needs_sw_pad`. Subsequent chunks of that video **skip tier 1** and start at tier 2.
- **Second failure** (sw-pad also fails, or HDR source which skips tier 2) → state becomes `hw_unsafe`. Subsequent chunks **skip VAAPI entirely** and go straight to software.

Wiped on server restart so a driver/ffmpeg upgrade gets re-evaluated.

Events: `vaapi_marked_needs_sw_pad`, `vaapi_marked_unsafe` on the `transcode.job` span.

## Span attributes to inspect when debugging

On `transcode.job`:

- `hwaccel`: the backend actually used (`software` / `vaapi` / `videotoolbox` / …). If an HDR 4K span shows `software`, the cascade fell through.
- `hwaccel.hdr_tonemap`: boolean, `true` when `tonemap_vaapi` was in the filter chain. If it's `false` on an HDR source, the source-detection logic (`FFmpegFile.isHdr`) missed it.
- `hwaccel.vaapi_sw_pad`: boolean, `true` for tier-2 retries (SDR only).
- `hwaccel.forced_software`: boolean, `true` for tier-3 retries.

## When touching the VAAPI branch

1. **Always test with an HDR 4K source.** SDR-only smoke tests miss this whole file's worth of gotchas. Use the encode test (`server/src/services/__tests__/chunker.encode.test.ts` — Furiosa fixture) when `XSTREAM_TEST_MEDIA_DIR` is configured.
2. **Never add `-colorspace bt709 -color_primaries bt709 -color_trc bt709` as output flags** even if a forum suggests it. See the symptoms table.
3. **Driver requirement**: jellyfin-ffmpeg + Intel iHD driver ≥ 22.x (for `tonemap_vaapi` support). `bun run setup-ffmpeg` installs the pinned jellyfin-ffmpeg which bundles a compatible driver.
4. **HDR 4K on VAAPI has exactly 2 effective tiers, not 3.** The tier-2 retry is short-circuited for HDR because HDR produces an identical filter chain at both tiers (no pad in either), so retrying would just fail the same way.
