# `tfdt` vs first-sample DTS mismatch (the deeper reason `elst` breaks MSE)

> **TL;DR** — When ffmpeg's mov muxer writes an empty `elst` edit (e.g. to mask a 21 ms presentation delay), it also writes the per-fragment `tfdt` (track fragment decode time) in the **post-edit** timeline (which starts at 0). The actual samples in the `trun` use the **pre-edit** timeline (starting at +504 ticks). A regular MP4 player honours `elst`, shifts samples back, and `tfdt` matches reality. **MSE ignores `elst`** — so the demuxer sees `tfdt=0` claiming "first sample is at decode-time 0" while the first sample's actual `dts=504`. This 504-tick offset accumulates across fragments and trips the demuxer once it exceeds tolerance — typically 2–4 seconds in. The fix is the same as 01-Negative-DTS.md: drop the HLS muxer for direct fmp4 with `+negative_cts_offsets`, which writes neither the elst nor the mismatched `tfdt`.

## How this hides

This bug is sneakier than negative-DTS because:

- `ffprobe` of any individual segment *looks fine*. PTS/DTS are monotonic, no negative values, valid keyframe markers.
- Even decoding the concatenated init+segments end-to-end with `ffmpeg -i concat -f null -` succeeds. **The bytes are valid MP4; the bug is in fragment metadata, not samples.**
- The browser error message is identical to the negative-DTS bug — Firefox's `Invalid Top-Level Box` and Chromium's `CHUNK_DEMUXER_ERROR_APPEND_FAILED` are catch-alls for "I can't process this fragment."
- Playback advances meaningfully (~3.85 s in our 4K Furiosa case) before failing, so it doesn't look like a setup problem.

The discriminating evidence is in the `tfdt` boxes.

## Diagnostic walkthrough

Inspect `tfdt` baseMediaDecodeTime per segment vs the first sample's actual DTS:

```sh
for seg in segment_*.m4s; do
  python3 -c "
import struct
with open('$seg', 'rb') as f: data = f.read()
i = 0
while True:
    idx = data.find(b'tfdt', i)
    if idx < 0: break
    body = data[idx+4:]
    ver = body[0]
    bdt = struct.unpack('>Q' if ver==1 else '>I', body[4:12 if ver==1 else 8])[0]
    print('$seg', 'tfdt=', bdt)
    i = idx + 4
"
done
```

Then look at first sample DTS:

```sh
for seg in segment_*.m4s; do
  cat init.mp4 $seg > /tmp/x.mp4
  echo "=== $seg ==="
  ffprobe -v error -show_entries packet=pts,dts -read_intervals "%+#1" /tmp/x.mp4
done
```

In the broken case (HLS muxer) we observed:

| Segment | `tfdt` (claimed) | First sample DTS (actual) | Δ |
|---|---:|---:|---:|
| seg0 | 0 | 504 | +504 |
| seg1 | 48048 | 48552 | +504 |
| seg2 | 96096 | 96600 | +504 |
| seg3 | 144144 | 144648 | +504 |

Constant +504-tick offset = the size of the 21-tick empty `elst` edit (1000-tick movie timescale × 24 = 24000-tick media timescale, ratio 24:1).

In the fixed case (direct fmp4 + `+negative_cts_offsets`), `tfdt` exactly matches first-sample DTS, no `elst` at all.

## Why MSE specifically can't tolerate this

A normal MP4 player loads moov, parses `elst`, learns "skip 21 ticks of media-time at the start." Sample timing is then computed as `tfdt + sample_dts_within_trun - elst_offset`. The 504-tick mismatch never surfaces — it's exactly the offset the elst told the player to subtract.

MSE's chunk demuxer skips edit-list interpretation. It computes timing as `tfdt + sample_dts_within_trun`. The 504-tick offset is now a real, undocumented offset between fragments — and across N fragments, it accumulates linearly. Some demuxers tolerate small offsets briefly (Chromium accepts the first ~3.85 s, then refuses); Firefox is stricter.

## Why this entered the codebase

ffmpeg's mov muxer writes the empty `elst` automatically when:

- The first sample's PTS isn't exactly 0, **and**
- `negative_cts_offsets` movflag is **not** set.

With the HLS muxer wrapping fmp4, `-movflags +negative_cts_offsets` is silently dropped by the wrapper (same wrapper-eats-the-flag bug as `-avoid_negative_ts`). So even adding the right movflag in the chunker args was a no-op until we left the HLS muxer behind.

## Fix

Same as 01: use `-f mp4` (not `-f hls`) plus `-movflags +negative_cts_offsets+frag_keyframe+empty_moov+separate_moof+default_base_moof`. Implementation in `server-rust/src/services/ffmpeg_file.rs::fmp4_muxer_options`. Splitting the resulting single fmp4 into `init.mp4 + segment_NNNN.m4s` is handled by `services/fmp4_tail_reader.rs`.

After the fix, every produced segment satisfies `tfdt == first_sample_dts` — verified by re-running the python+ffprobe diagnostic above against a fresh transcode.

## How to spot a regression of this specific bug

If a user reports playback that **advances past 0** but stalls between 2–5 s with the same `Invalid Top-Level Box` / `CHUNK_DEMUXER_ERROR_APPEND_FAILED` family of errors:

1. Check whether the on-disk `init.mp4` contains an `elst` box (`ffprobe -v trace -i init.mp4 2>&1 | grep elst`). It should not.
2. Compare `tfdt` to first-sample DTS for at least segments 0 and 1. They should match exactly.
3. If `elst` is present or `tfdt != first_sample_dts`, the muxer flags regressed — `fmp4_muxer_options` lost `+negative_cts_offsets` or someone re-introduced a wrapping muxer that swallows it.

## References

- ISO/IEC 14496-12 §8.6.6 (Edit List Box) — defines `elst` semantics.
- ISO/IEC 14496-12 §8.16.1 (Track Fragment Base Media Decode Time Box) — defines `tfdt`.
- Source code — `server-rust/src/services/ffmpeg_file.rs::fmp4_muxer_options`, `services/fmp4_tail_reader.rs`.
- Discovery trace — Seq `5dc0b70fcfbc34cf6af8259c217fdc54` (currentTime advances to 3.85 s before failing).
- Verification trace — Seq trace recorded after the Option B landing showed `currentTime=41.97 s` with `buffered_end=74.09 s`, no recovery cycles.
- Sibling caveat — `01-Negative-DTS.md` (the more obvious bug; this entry is the load-bearing follow-on).
