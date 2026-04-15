/**
 * FFmpegFile — wraps a video file path and derives correct transcode parameters
 * from its actual codec/format metadata, instead of making hardcoded assumptions.
 *
 * Usage:
 *   const f = new FFmpegFile("/path/to/video.mkv");
 *   await f.probe();
 *   const cmd = f.applyTo(ffmpeg("/path/to/video.mkv"), profile);
 */
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";
import ffmpeg from "fluent-ffmpeg";

import type { ResolutionProfile } from "../types.js";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// ── Internal probe types ─────────────────────────────────────────────────────

export interface VideoStreamInfo {
  index: number;
  codec: string; // hevc, h264, av1, vp9 …
  width: number;
  height: number;
  fps: number;
  pixFmt: string; // yuv420p, yuv420p10le, yuv420p12le …
  bitDepth: number; // 8, 10, 12 — derived from pixFmt
  colorTransfer: string; // bt709, smpte2084 (HDR10), arib-std-b67 (HLG) …
  colorSpace: string; // bt709, bt2020nc …
}

export interface AudioStreamInfo {
  index: number;
  codec: string; // aac, ac3, eac3, dts, flac, truehd …
  channels: number;
  sampleRate: number;
}

export interface FileMetadata {
  durationSeconds: number;
  fileSizeBytes: number;
  bitrateKbps: number;
  videoStreams: VideoStreamInfo[];
  audioStreams: AudioStreamInfo[];
  subtitleStreamCount: number;
  /** True when the primary video track is 10-bit or higher */
  isHighBitDepth: boolean;
  /** True when the primary video track carries HDR metadata */
  isHdr: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function evalFraction(fraction: string): number {
  const [num, den] = fraction.split("/").map(Number);
  return den ? num / den : num;
}

/** Derive bit depth from a pixel format string.
 *  yuv420p        → 8
 *  yuv420p10le    → 10
 *  yuv420p12le    → 12
 *  p010le         → 10   (Windows/DXVA format used by some HEVC streams)
 */
function bitDepthFromPixFmt(pixFmt: string): number {
  const m = pixFmt.match(/(\d+)(?:le|be)?$/);
  if (m) {
    const n = parseInt(m[1], 10);
    // pixel format strings end with bit count (8, 10, 12, 16…)
    if (n >= 8 && n <= 16) return n;
  }
  return 8; // default — all plain yuv420p / rgb24 / etc. are 8-bit
}

const HDR_TRANSFERS = new Set([
  "smpte2084", // HDR10 / PQ
  "arib-std-b67", // HLG
  "smpte428", // DCI-P3
]);

// ── FFmpegFile class ─────────────────────────────────────────────────────────

export class FFmpegFile {
  readonly path: string;
  private _metadata: FileMetadata | null = null;

  constructor(path: string) {
    this.path = path;
  }

  // ── Probing ────────────────────────────────────────────────────────────────

  /** Run ffprobe and cache results. Must be called before any other methods. */
  async probe(): Promise<FileMetadata> {
    if (this._metadata) return this._metadata;

    const data = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(this.path, (err, d) => (err ? reject(err) : resolve(d)));
    });

    const videoStreams: VideoStreamInfo[] = data.streams
      .filter((s) => s.codec_type === "video")
      .map((s) => {
        const pixFmt = (s.pix_fmt as string | undefined) ?? "yuv420p";
        const bitDepth = bitDepthFromPixFmt(pixFmt);
        return {
          index: s.index,
          codec: s.codec_name ?? "unknown",
          width: s.width ?? 0,
          height: s.height ?? 0,
          fps: s.r_frame_rate ? evalFraction(s.r_frame_rate) : 24,
          pixFmt,
          bitDepth,
          colorTransfer: (s.color_transfer as string | undefined) ?? "bt709",
          colorSpace: (s.color_space as string | undefined) ?? "bt709",
        };
      });

    const audioStreams: AudioStreamInfo[] = data.streams
      .filter((s) => s.codec_type === "audio")
      .map((s) => ({
        index: s.index,
        codec: s.codec_name ?? "unknown",
        channels: s.channels ?? 2,
        sampleRate: s.sample_rate ? Number(s.sample_rate) : 48000,
      }));

    const subtitleStreamCount = data.streams.filter((s) => s.codec_type === "subtitle").length;

    const primary = videoStreams[0];
    const isHighBitDepth = primary ? primary.bitDepth > 8 : false;
    const isHdr = primary ? HDR_TRANSFERS.has(primary.colorTransfer) : false;

    this._metadata = {
      durationSeconds: Number(data.format.duration ?? 0),
      fileSizeBytes: Number(data.format.size ?? 0),
      bitrateKbps: Math.round(Number(data.format.bit_rate ?? 0) / 1000),
      videoStreams,
      audioStreams,
      subtitleStreamCount,
      isHighBitDepth,
      isHdr,
    };

    return this._metadata;
  }

  get metadata(): FileMetadata {
    if (!this._metadata) throw new Error("Call probe() before accessing metadata");
    return this._metadata;
  }

  // ── Option builders ────────────────────────────────────────────────────────

  /**
   * Stream mapping options.
   * Always maps the first video and first audio track explicitly to avoid
   * ffmpeg trying to mux incompatible subtitle/data streams (common in Blu-ray
   * MKVs with PGS subtitles).
   */
  streamMappingOptions(): string[] {
    return ["-map 0:v:0", "-map 0:a:0"];
  }

  /**
   * Pixel format options.
   * libx264 only accepts 8-bit input. Any 10-bit or higher source (HDR10,
   * Dolby Vision, some HEVC Blu-ray) must be converted.
   */
  pixelFormatOptions(): string[] {
    return this.metadata.isHighBitDepth ? ["-pix_fmt yuv420p"] : [];
  }

  /**
   * Video scale + letterbox filter for the target resolution profile.
   * Uses force_original_aspect_ratio=decrease so wide or tall content is
   * pillarboxed/letterboxed rather than stretched.
   */
  scaleFilterOptions(profile: ResolutionProfile): string[] {
    return [
      `-vf scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
    ];
  }

  /**
   * All video codec + bitrate options for the target profile.
   */
  videoCodecOptions(profile: ResolutionProfile): string[] {
    const maxBitrate = `${Math.round(parseInt(profile.videoBitrate) * 1.2)}k`;
    const bufSize = `${Math.round(parseInt(profile.videoBitrate) * 2)}k`;

    return [
      `-preset veryfast`,
      `-profile:v high`,
      `-level:v ${profile.h264Level}`,
      `-b:v ${profile.videoBitrate}`,
      `-maxrate ${maxBitrate}`,
      `-bufsize ${bufSize}`,
      // GOP aligned to 48 frames — keeps segment boundaries clean at 24fps
      `-g 48`,
      `-keyint_min 48`,
      `-sc_threshold 0`,
    ];
  }

  /**
   * Audio codec + bitrate options.
   * Always transcodes to AAC for maximum browser compatibility.
   */
  audioCodecOptions(profile: ResolutionProfile): string[] {
    return [`-b:a ${profile.audioBitrate}`];
  }

  /**
   * HLS fMP4 muxer options for the target profile.
   * Produces init.mp4 + segment_NNNN.m4s files compatible with MSE.
   */
  hlsMuxerOptions(
    profile: ResolutionProfile,
    segmentPattern: string,
    _segmentDir: string
  ): string[] {
    return [
      `-f hls`,
      `-hls_time ${profile.segmentDuration}`,
      `-hls_segment_type fmp4`,
      `-hls_fmp4_init_filename init.mp4`,
      `-hls_segment_filename ${segmentPattern}`,
      `-hls_list_size 0`,
      `-hls_flags omit_endlist`,
    ];
  }

  /**
   * Convenience: apply all output options to a fluent-ffmpeg command and
   * return it ready to `.output(...).run()`.
   *
   * The caller is responsible for setting `.seekInput()` / `.duration()` and
   * `.output()` before calling `.run()`.
   */
  applyOutputOptions(
    command: ffmpeg.FfmpegCommand,
    profile: ResolutionProfile,
    segmentPattern: string,
    segmentDir: string
  ): ffmpeg.FfmpegCommand {
    return command
      .outputOptions(this.streamMappingOptions())
      .videoCodec("libx264")
      .outputOptions([
        ...this.videoCodecOptions(profile),
        ...this.pixelFormatOptions(),
        ...this.scaleFilterOptions(profile),
      ])
      .audioCodec("aac")
      .outputOptions(this.audioCodecOptions(profile))
      .outputOptions(this.hlsMuxerOptions(profile, segmentPattern, segmentDir));
  }

  /** Human-readable summary of what was detected (useful for server logs). */
  summary(): string {
    const m = this.metadata;
    const v = m.videoStreams[0];
    const a = m.audioStreams[0];
    const parts: string[] = [];
    if (v) parts.push(`${v.codec} ${v.width}×${v.height} ${v.pixFmt}${m.isHdr ? " HDR" : ""}`);
    if (a) parts.push(`${a.codec} ${a.channels}ch`);
    if (m.subtitleStreamCount > 0) parts.push(`${m.subtitleStreamCount} subtitle track(s)`);
    return parts.join(", ");
  }
}
