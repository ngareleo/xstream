# HDR / VAAPI Pad Artifact

**Symptom:** green (or pink) overlay on 4K HDR playback via VAAPI; SDR renders cleanly on the same path.

**Root cause:** `pad_vaapi`'s fill color is interpreted in the *output* color space. On HDR sources, colour matrix/primaries metadata flows through as BT.2020, so `color=black` is decoded under BT.2020→display transforms and becomes chroma green.

## Workarounds (cheapest first)

1. Force output colour metadata before `pad_vaapi`: `-colorspace bt709 -color_primaries bt709 -color_trc bt709` (we transcode to 8-bit H.264 SDR, so this is honest).
2. Pad on the CPU side: `scale_vaapi=...,hwdownload,format=nv12,pad=W:H:x:y:color=black,hwupload`. Costs a system-memory round-trip.
3. Drop padding entirely (no `force_original_aspect_ratio=decrease`). Only if stretched/cropped output is acceptable.

When touching the VAAPI branch of `applyOutputOptions`, test with an HDR 4K source (e.g. Furiosa 2160p) — SDR-only smoke tests miss this.
