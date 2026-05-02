# FFmpeg Invocation Patterns

Cross-implementation invariants for ffmpeg process invocation that are load-bearing for correctness.

---

## Argument list reproducibility

ffmpeg accepts command-line arguments as a flat list of strings. The argv is split at the input boundary: `ffmpeg [pre-input] -i [input] [post-input] [output]`.

**Load-bearing invariant:** Every encode job must be reproducible from its `jobId` hash. The hash is deterministic iff the argv is deterministic. This means:
- **Flags must be separate array elements** — don't concatenate flag and value into a single string. `["-init_hw_device", "vaapi=va:/dev/dri/renderD128"]` is correct; `["-init_hw_device vaapi=..."]` is wrong and will not parse.
- **Order matters** — argv builders must produce the same sequence on every invocation. The chunker's argv is built from pure functions with no side effects; Rust's type system enforces this statically.
- **All options must be explicit** — when ffmpeg defaults change (ffmpeg version upgrades), we must explicitly set the option to the prior value so cached segments don't become stale. This includes bitrate, `-g` (keyframe interval), `-fflags`, and filter chains.

See [`server-rust/src/services/ffmpeg_file.rs::build_encode_argv`](../../../../server-rust/src/services/ffmpeg_file.rs) for the production argv builders.

---

## In-band SPS/PPS injection on every keyframe

The chunker adds `-bsf:v dump_extra=keyframe` to every encode (software and VAAPI branches). This injects H.264 SPS/PPS NAL units before every keyframe.

**Why:** Chromium's MSE chunk demuxer needs SPS/PPS in-band on every fragment seam to reset its decoder context. Without them, `appendBuffer()` accepts the bytes silently but the demuxer can fail at the sample-prepare step and Chromium internally calls `endOfStream(decode_error)`, sealing the MediaSource permanently. See `docs/architecture/Streaming/02-Chunk-Pipeline-Invariants.md` § 1a for the full trace.

The bitstream filter is encoder-agnostic — it works with libx264 (software) and h264_vaapi equally.

---

## Segment output validation

ffmpeg exits with code 0 even if it produced no output segments on certain HW-accel paths (e.g., `-ss 0 -t SHORT` on VAAPI HDR 4K). The span event `transcode_silent_failure` (status ERROR) is emitted when `segment_count === 0` on a job that exited cleanly.

The server logs `ffmpeg_stderr` (4 KB tail) for diagnosis. See `docs/server/Hardware-Acceleration/01-HDR-Pad-Artifact.md` for the full cascade and recovery path.
