//! ffprobe wrapper and encode-argv builders from metadata + profile + HW config.

use std::path::{Path, PathBuf};

use serde::Deserialize;
use thiserror::Error;
use tokio::process::Command;

use crate::config::{bitrate_kbps, ResolutionProfile};

/// Tagged-union HW-accel config. Only `Software` and `Vaapi` carry real
/// argv branches today; the other variants are placeholders for the
/// per-platform ports listed in `Plan/Open-Questions.md §1`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum HwAccelConfig {
    Software,
    Vaapi { device: String },
    VideoToolbox,
    Qsv,
    Nvenc,
    Amf,
}

impl HwAccelConfig {
    pub fn kind_str(&self) -> &'static str {
        match self {
            Self::Software => "software",
            Self::Vaapi { .. } => "vaapi",
            Self::VideoToolbox => "videotoolbox",
            Self::Qsv => "qsv",
            Self::Nvenc => "nvenc",
            Self::Amf => "amf",
        }
    }
}

#[derive(Clone, Debug)]
pub struct VideoStreamInfo {
    pub index: u32,
    pub codec: String,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub pix_fmt: String,
    pub bit_depth: u32,
    pub color_transfer: String,
    pub color_space: String,
}

#[derive(Clone, Debug)]
pub struct AudioStreamInfo {
    pub index: u32,
    pub codec: String,
    pub channels: u32,
    pub sample_rate: u32,
}

#[derive(Clone, Debug)]
pub struct FileMetadata {
    pub duration_seconds: f64,
    pub file_size_bytes: u64,
    pub bitrate_kbps: u64,
    pub video_streams: Vec<VideoStreamInfo>,
    pub audio_streams: Vec<AudioStreamInfo>,
    pub subtitle_stream_count: u32,
    /// True when the primary video track is 10-bit or higher.
    pub is_high_bit_depth: bool,
    /// True when the primary video track carries HDR metadata.
    pub is_hdr: bool,
}

const HDR_TRANSFERS: &[&str] = &[
    "smpte2084",    // HDR10 / PQ
    "arib-std-b67", // HLG
    "smpte428",     // DCI-P3
];

#[derive(Debug, Error)]
pub enum ProbeError {
    #[error("spawning '{ffprobe}' for {input}: {source}")]
    Spawn {
        ffprobe: PathBuf,
        input: PathBuf,
        #[source]
        source: std::io::Error,
    },

    #[error("ffprobe exited with status {status} for {input}; stderr={stderr:?}")]
    ExitNonZero {
        input: PathBuf,
        status: i32,
        stderr: String,
    },

    #[error("parsing ffprobe JSON for {input}: {source}")]
    ParseJson {
        input: PathBuf,
        #[source]
        source: serde_json::Error,
    },
}

#[derive(Deserialize)]
struct ProbeOutput {
    streams: Vec<ProbeStream>,
    format: ProbeFormat,
}

#[derive(Deserialize)]
struct ProbeStream {
    index: u32,
    codec_type: String,
    #[serde(default)]
    codec_name: Option<String>,
    #[serde(default)]
    width: Option<u32>,
    #[serde(default)]
    height: Option<u32>,
    #[serde(default)]
    pix_fmt: Option<String>,
    #[serde(default)]
    color_transfer: Option<String>,
    #[serde(default)]
    color_space: Option<String>,
    #[serde(default)]
    r_frame_rate: Option<String>,
    #[serde(default)]
    channels: Option<u32>,
    #[serde(default)]
    sample_rate: Option<String>,
}

#[derive(Deserialize)]
struct ProbeFormat {
    #[serde(default)]
    duration: Option<String>,
    #[serde(default)]
    size: Option<String>,
    #[serde(default)]
    bit_rate: Option<String>,
}

#[derive(Clone, Debug)]
pub struct FfmpegFile {
    pub path: PathBuf,
    metadata: Option<FileMetadata>,
}

impl FfmpegFile {
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            metadata: None,
        }
    }

    /// Run `ffprobe -of json -show_streams -show_format` against `self.path`
    /// and cache the parsed metadata. Repeat calls are no-ops.
    pub async fn probe(&mut self, ffprobe: &Path) -> Result<&FileMetadata, ProbeError> {
        if self.metadata.is_none() {
            let metadata = self.run_probe(ffprobe).await?;
            return Ok(self.metadata.insert(metadata));
        }
        // The early-return above is the only path that could leave `metadata`
        // unset; falling through here means it was already `Some`.
        match &self.metadata {
            Some(m) => Ok(m),
            None => unreachable!("metadata is_some by construction above"),
        }
    }

    async fn run_probe(&self, ffprobe: &Path) -> Result<FileMetadata, ProbeError> {
        let output = Command::new(ffprobe)
            .args([
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_streams",
                "-show_format",
            ])
            .arg(&self.path)
            .output()
            .await
            .map_err(|source| ProbeError::Spawn {
                ffprobe: ffprobe.to_path_buf(),
                input: self.path.clone(),
                source,
            })?;

        if !output.status.success() {
            return Err(ProbeError::ExitNonZero {
                input: self.path.clone(),
                status: output.status.code().unwrap_or(-1),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            });
        }

        parse_probe_json(&output.stdout, &self.path)
    }

    pub fn metadata(&self) -> Option<&FileMetadata> {
        self.metadata.as_ref()
    }
}

fn parse_probe_json(stdout: &[u8], input: &Path) -> Result<FileMetadata, ProbeError> {
    let probe: ProbeOutput =
        serde_json::from_slice(stdout).map_err(|source| ProbeError::ParseJson {
            input: input.to_path_buf(),
            source,
        })?;

    let video_streams: Vec<VideoStreamInfo> = probe
        .streams
        .iter()
        .filter(|s| s.codec_type == "video")
        .map(|s| {
            let pix_fmt = s.pix_fmt.clone().unwrap_or_else(|| "yuv420p".to_string());
            let bit_depth = bit_depth_from_pix_fmt(&pix_fmt);
            VideoStreamInfo {
                index: s.index,
                codec: s
                    .codec_name
                    .clone()
                    .unwrap_or_else(|| "unknown".to_string()),
                width: s.width.unwrap_or(0),
                height: s.height.unwrap_or(0),
                fps: s.r_frame_rate.as_deref().map(eval_fraction).unwrap_or(24.0),
                pix_fmt,
                bit_depth,
                color_transfer: s
                    .color_transfer
                    .clone()
                    .unwrap_or_else(|| "bt709".to_string()),
                color_space: s.color_space.clone().unwrap_or_else(|| "bt709".to_string()),
            }
        })
        .collect();

    let audio_streams: Vec<AudioStreamInfo> = probe
        .streams
        .iter()
        .filter(|s| s.codec_type == "audio")
        .map(|s| AudioStreamInfo {
            index: s.index,
            codec: s
                .codec_name
                .clone()
                .unwrap_or_else(|| "unknown".to_string()),
            channels: s.channels.unwrap_or(2),
            sample_rate: s
                .sample_rate
                .as_deref()
                .and_then(|s| s.parse().ok())
                .unwrap_or(48_000),
        })
        .collect();

    let subtitle_stream_count = probe
        .streams
        .iter()
        .filter(|s| s.codec_type == "subtitle")
        .count() as u32;

    let primary = video_streams.first();
    let is_high_bit_depth = primary.map(|v| v.bit_depth > 8).unwrap_or(false);
    let is_hdr = primary
        .map(|v| HDR_TRANSFERS.contains(&v.color_transfer.as_str()))
        .unwrap_or(false);

    let duration_seconds = probe
        .format
        .duration
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0.0);
    let file_size_bytes = probe
        .format
        .size
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let bitrate_kbps_raw: u64 = probe
        .format
        .bit_rate
        .as_deref()
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    let bitrate_kbps = bitrate_kbps_raw / 1000;

    Ok(FileMetadata {
        duration_seconds,
        file_size_bytes,
        bitrate_kbps,
        video_streams,
        audio_streams,
        subtitle_stream_count,
        is_high_bit_depth,
        is_hdr,
    })
}

fn eval_fraction(s: &str) -> f64 {
    let mut parts = s.split('/');
    let n: f64 = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0.0);
    let d: f64 = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0.0);
    if d != 0.0 {
        n / d
    } else {
        n
    }
}

/// Derive bit depth from an ffmpeg pixel format string.
/// `yuv420p` → 8, `yuv420p10le` → 10, `p010le` → 10, etc.
fn bit_depth_from_pix_fmt(pix_fmt: &str) -> u32 {
    // Strip a trailing endianness suffix, then read off the trailing digits.
    let stripped = pix_fmt
        .strip_suffix("le")
        .or_else(|| pix_fmt.strip_suffix("be"))
        .unwrap_or(pix_fmt);
    let digits: String = stripped
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect::<String>()
        .chars()
        .rev()
        .collect();
    let n: u32 = digits.parse().unwrap_or(8);
    if (8..=16).contains(&n) {
        n
    } else {
        8
    }
}

/// Resolved encode argv split at the input boundary. The chunker calls
/// `tokio::process::Command::new(ffmpeg).args(pre_input).arg("-i").arg(input).args(post_input).arg(output_pattern)`.
#[derive(Clone, Debug)]
pub struct EncodeArgv {
    /// Global + input-side options that go before `-i input`.
    pub pre_input: Vec<String>,
    /// Output-side options that go after `-i input` and before the output.
    pub post_input: Vec<String>,
}

impl EncodeArgv {
    fn empty_pre() -> Self {
        Self {
            pre_input: Vec::new(),
            post_input: Vec::new(),
        }
    }

    fn extend_post<I, S>(&mut self, args: I)
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.post_input.extend(args.into_iter().map(Into::into));
    }
}

/// Build the full encode argv for a given combination of source metadata,
/// hardware-accel config, and resolution profile. `segment_pattern` is the
/// absolute path passed to ffmpeg's `-hls_segment_filename` (e.g.
/// `/tmp/segments-rust/<jobId>/segment_%04d.m4s`).
///
/// `vaapi_sw_pad` engages the cascade's middle tier — software pad with
/// hwdownload/hwupload around it — when `pad_vaapi` rejects a SDR source's
/// surface format. The chunker sets it on retry after a tier-1 failure.
pub fn build_encode_argv(
    metadata: &FileMetadata,
    hw_accel: &HwAccelConfig,
    profile: &ResolutionProfile,
    output_path: &str,
    vaapi_sw_pad: bool,
) -> EncodeArgv {
    let mut argv = EncodeArgv::empty_pre();

    match hw_accel {
        HwAccelConfig::Software => {
            argv.extend_post(stream_mapping_options());
            argv.post_input.push("-c:v".into());
            argv.post_input.push("libx264".into());
            argv.extend_post(video_codec_options(profile));
            if metadata.is_high_bit_depth {
                argv.post_input.push("-pix_fmt".into());
                argv.post_input.push("yuv420p".into());
            }
            argv.extend_post(scale_filter_options(profile));
            argv.post_input.push("-c:a".into());
            argv.post_input.push("aac".into());
            argv.extend_post(audio_codec_options(profile));
            argv.extend_post(in_band_sps_pps());
            argv.extend_post(fmp4_muxer_options(profile, output_path));
        }
        HwAccelConfig::Vaapi { device } => {
            let (input, output) =
                vaapi_video_options(profile, device, vaapi_sw_pad, metadata.is_hdr);
            argv.pre_input.extend(input);
            argv.extend_post(stream_mapping_options());
            argv.post_input.push("-c:v".into());
            argv.post_input.push("h264_vaapi".into());
            argv.extend_post(output);
            argv.post_input.push("-c:a".into());
            argv.post_input.push("aac".into());
            argv.extend_post(audio_codec_options(profile));
            argv.extend_post(in_band_sps_pps());
            argv.extend_post(fmp4_muxer_options(profile, output_path));
        }
        HwAccelConfig::VideoToolbox
        | HwAccelConfig::Qsv
        | HwAccelConfig::Nvenc
        | HwAccelConfig::Amf => {
            // Per-platform ports tracked in `Plan/Open-Questions.md §1`.
            // The hw_accel detector never returns these today, so this
            // branch is unreachable at runtime — the panic surfaces a
            // future regression where someone wires a detector path
            // without also wiring the argv path.
            panic!(
                "HW accel '{}' not yet implemented in build_encode_argv. \
                 Add the branch when porting the per-platform encode path.",
                hw_accel.kind_str()
            );
        }
    }

    argv
}

fn stream_mapping_options() -> Vec<String> {
    // First video, first audio. Skips PGS subs and other Blu-ray detritus
    // ffmpeg would otherwise try to mux.
    vec!["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0".into()]
}

fn video_codec_options(profile: &ResolutionProfile) -> Vec<String> {
    let bitrate_n = bitrate_kbps(profile.video_bitrate);
    let max_bitrate = format!("{}k", (bitrate_n as f64 * 1.2).round() as u64);
    let buf_size = format!("{}k", bitrate_n * 2);
    vec![
        "-preset".into(),
        "veryfast".into(),
        "-profile:v".into(),
        "high".into(),
        "-level:v".into(),
        profile.h264_level.to_string(),
        "-b:v".into(),
        profile.video_bitrate.to_string(),
        "-maxrate".into(),
        max_bitrate,
        "-bufsize".into(),
        buf_size,
        // GOP aligned to 48 frames — clean segment boundaries at 24 fps.
        "-g".into(),
        "48".into(),
        "-keyint_min".into(),
        "48".into(),
        "-sc_threshold".into(),
        "0".into(),
    ]
}

fn audio_codec_options(profile: &ResolutionProfile) -> Vec<String> {
    vec!["-b:a".into(), profile.audio_bitrate.to_string()]
}

fn scale_filter_options(profile: &ResolutionProfile) -> Vec<String> {
    let vf = format!(
        "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2",
        w = profile.width,
        h = profile.height,
    );
    vec!["-vf".into(), vf]
}

fn in_band_sps_pps() -> Vec<String> {
    // Chromium needs SPS/PPS in-band on every keyframe to reset its decoder
    // context across fragment seams; without this the chunk demuxer can
    // silently seal the MediaSource a few seconds after a fresh seek.
    vec!["-bsf:v".into(), "dump_extra=keyframe".into()]
}

/// Direct fragmented-MP4 muxer options. Writes a single growing
/// `chunk.fmp4` file; the `fmp4_tail_reader` task splits it into
/// `init.mp4` + `segment_NNNN.m4s`.
///
/// Why not `-f hls`? The HLS-fmp4 muxer wraps an internal fmp4 muxer
/// and silently ignores muxer-level flags like `-avoid_negative_ts`
/// and `-movflags +negative_cts_offsets`. Without those flags ffmpeg
/// writes an `elst` (edit list) and a `tfdt` value that disagrees
/// with the actual sample DTS by ~21 ms; MSE ignores `elst` and the
/// mismatch eventually trips the demuxer. See
/// `docs/server/FFmpeg-Caveats/02-Tfdt-Sample-Mismatch.md`.
fn fmp4_muxer_options(profile: &ResolutionProfile, output_path: &str) -> Vec<String> {
    vec![
        // Shift any negative DTS up so the stream's first DTS is exactly 0.
        // With direct fmp4 (vs HLS), this flag actually reaches the muxer.
        "-avoid_negative_ts".into(),
        "make_zero".into(),
        "-f".into(),
        "mp4".into(),
        // `+frag_keyframe`: cut a fragment at every keyframe.
        // `+empty_moov`: leading moov has no sample tables (fragmented).
        // `+separate_moof`: each fragment has its own moof (one moof per mdat).
        // `+default_base_moof`: tfhd uses default-base-is-moof so byte offsets
        //                       are relative to each moof — required for CMAF / MSE.
        // `+negative_cts_offsets`: write CTS offsets in CTTS v1 instead of
        //                          adding an empty `elst`. This is the key
        //                          fix that lets `tfdt` line up with the
        //                          actual first-sample DTS.
        "-movflags".into(),
        "+frag_keyframe+empty_moov+separate_moof+default_base_moof+negative_cts_offsets".into(),
        // Force a fragment boundary every `segment_duration` seconds even
        // if the encoder's keyframes don't land there. The encoder's
        // `-g`/`-keyint_min` are aligned anyway, but this is the safety net.
        "-frag_duration".into(),
        ((profile.segment_duration as u64) * 1_000_000).to_string(),
        output_path.to_string(),
    ]
}

/// Build the VAAPI input + output options for the given profile + device.
/// Returns (pre-input args, post-input args). The HDR branch adds a
/// tonemap_vaapi filter and tags the output surface as bt709; the sw-pad
/// branch round-trips through CPU memory for the pad step only.
pub(crate) fn vaapi_video_options(
    profile: &ResolutionProfile,
    device: &str,
    use_sw_pad: bool,
    is_hdr: bool,
) -> (Vec<String>, Vec<String>) {
    let input = vec![
        "-init_hw_device".into(),
        format!("vaapi=va:{device}"),
        "-hwaccel".into(),
        "vaapi".into(),
        "-hwaccel_output_format".into(),
        "vaapi".into(),
    ];

    let tonemap = if is_hdr {
        "tonemap_vaapi=format=nv12:t=bt709:m=bt709:p=bt709,"
    } else {
        ""
    };

    let scale_color_tag = if is_hdr {
        ":out_color_matrix=bt709:out_color_primaries=bt709:out_color_transfer=bt709:out_range=tv"
    } else {
        ""
    };

    let scale = format!(
        "scale_vaapi=w={w}:h={h}:force_original_aspect_ratio=decrease:format=nv12{tag}",
        w = profile.width,
        h = profile.height,
        tag = scale_color_tag,
    );
    let pad_vaapi = format!(
        "pad_vaapi=w={w}:h={h}:x=(ow-iw)/2:y=(oh-ih)/2",
        w = profile.width,
        h = profile.height,
    );
    let sw_pad_chain = format!(
        "{scale},hwdownload,format=nv12,\
         pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black,\
         hwupload",
        w = profile.width,
        h = profile.height,
    );

    let filter_chain = if is_hdr {
        // No pad of any kind for HDR — pad_vaapi is broken on these sources
        // and sw-pad's hwupload also fails on the CPU NV12 it produces.
        format!("{tonemap}{scale}")
    } else if use_sw_pad {
        sw_pad_chain
    } else {
        format!("{scale},{pad_vaapi}")
    };

    let bitrate_n = bitrate_kbps(profile.video_bitrate);
    let max_bitrate = format!("{}k", (bitrate_n as f64 * 1.2).round() as u64);
    let buf_size = format!("{}k", bitrate_n * 2);

    let output = vec![
        "-vf".into(),
        filter_chain,
        // NOTE: do NOT set `-colorspace`/`-color_primaries`/`-color_trc` here.
        // On HDR sources tagging the output triggers an auto-scaler that fails
        // with libva -38. Surface tagging happens via scale_vaapi's
        // `out_color_*` params; SDR sources keep their bt709 metadata
        // pass-through.
        "-profile:v".into(),
        "high".into(),
        "-level:v".into(),
        profile.h264_level.to_string(),
        "-b:v".into(),
        profile.video_bitrate.to_string(),
        "-maxrate".into(),
        max_bitrate,
        "-bufsize".into(),
        buf_size,
        "-g".into(),
        "48".into(),
        "-keyint_min".into(),
        "48".into(),
    ];

    (input, output)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::profile_for;
    use crate::graphql::scalars::Resolution;

    #[test]
    fn bit_depth_8_for_yuv420p() {
        assert_eq!(bit_depth_from_pix_fmt("yuv420p"), 8);
    }

    #[test]
    fn bit_depth_10_for_yuv420p10le() {
        assert_eq!(bit_depth_from_pix_fmt("yuv420p10le"), 10);
    }

    #[test]
    fn bit_depth_10_for_p010le() {
        assert_eq!(bit_depth_from_pix_fmt("p010le"), 10);
    }

    #[test]
    fn bit_depth_12_for_yuv420p12be() {
        assert_eq!(bit_depth_from_pix_fmt("yuv420p12be"), 12);
    }

    #[test]
    fn bit_depth_falls_back_to_8_on_unknown() {
        // Bit-depth strings outside [8, 16] degrade to 8 — the encoder
        // path treats unknown pixel formats as 8-bit by default.
        assert_eq!(bit_depth_from_pix_fmt("rgb24"), 8);
    }

    #[test]
    fn eval_fraction_handles_24_div_1() {
        assert!((eval_fraction("24/1") - 24.0).abs() < 1e-9);
    }

    #[test]
    fn eval_fraction_handles_24000_div_1001() {
        let v = eval_fraction("24000/1001");
        assert!((v - 23.976).abs() < 1e-2);
    }

    #[test]
    fn eval_fraction_returns_numerator_when_denominator_zero() {
        assert!((eval_fraction("30/0") - 30.0).abs() < 1e-9);
    }

    fn fixture_h264_sdr() -> &'static str {
        // Hand-written ffprobe -of json output for a typical SDR H.264 +
        // AAC + one subtitle source. The shape matches what jellyfin-ffmpeg
        // emits — keep this fixture in sync if the probe parser learns a
        // new field.
        r#"{
          "streams": [
            {
              "index": 0,
              "codec_type": "video",
              "codec_name": "h264",
              "width": 1920,
              "height": 1080,
              "pix_fmt": "yuv420p",
              "color_transfer": "bt709",
              "color_space": "bt709",
              "r_frame_rate": "24/1"
            },
            {
              "index": 1,
              "codec_type": "audio",
              "codec_name": "aac",
              "channels": 6,
              "sample_rate": "48000"
            },
            {
              "index": 2,
              "codec_type": "subtitle",
              "codec_name": "subrip"
            }
          ],
          "format": {
            "duration": "5400.0",
            "size": "10737418240",
            "bit_rate": "16000000"
          }
        }"#
    }

    fn fixture_hevc_hdr() -> &'static str {
        // 4K HDR10 — yuv420p10le + smpte2084 transfer, 24000/1001 fps.
        r#"{
          "streams": [
            {
              "index": 0,
              "codec_type": "video",
              "codec_name": "hevc",
              "width": 3840,
              "height": 2160,
              "pix_fmt": "yuv420p10le",
              "color_transfer": "smpte2084",
              "color_space": "bt2020nc",
              "r_frame_rate": "24000/1001"
            },
            {
              "index": 1,
              "codec_type": "audio",
              "codec_name": "eac3",
              "channels": 6,
              "sample_rate": "48000"
            }
          ],
          "format": {
            "duration": "7200.0",
            "size": "53687091200",
            "bit_rate": "60000000"
          }
        }"#
    }

    #[test]
    fn parse_probe_json_extracts_sdr_metadata() {
        let m =
            parse_probe_json(fixture_h264_sdr().as_bytes(), Path::new("/x.mkv")).expect("parse");
        assert_eq!(m.video_streams.len(), 1);
        let v = &m.video_streams[0];
        assert_eq!(v.codec, "h264");
        assert_eq!(v.width, 1920);
        assert_eq!(v.height, 1080);
        assert_eq!(v.pix_fmt, "yuv420p");
        assert_eq!(v.bit_depth, 8);
        assert!((v.fps - 24.0).abs() < 1e-9);
        assert!(!m.is_high_bit_depth);
        assert!(!m.is_hdr);
        assert_eq!(m.audio_streams.len(), 1);
        assert_eq!(m.audio_streams[0].channels, 6);
        assert_eq!(m.subtitle_stream_count, 1);
        assert!((m.duration_seconds - 5400.0).abs() < 1e-9);
        assert_eq!(m.file_size_bytes, 10_737_418_240);
        assert_eq!(m.bitrate_kbps, 16_000); // 16_000_000 / 1000
    }

    #[test]
    fn parse_probe_json_marks_hevc_hdr_correctly() {
        let m =
            parse_probe_json(fixture_hevc_hdr().as_bytes(), Path::new("/x.mkv")).expect("parse");
        assert!(m.is_high_bit_depth);
        assert!(m.is_hdr);
        assert_eq!(m.video_streams[0].bit_depth, 10);
        assert_eq!(m.video_streams[0].pix_fmt, "yuv420p10le");
        assert_eq!(m.video_streams[0].color_transfer, "smpte2084");
        assert_eq!(m.subtitle_stream_count, 0);
    }

    #[test]
    fn parse_probe_json_returns_typed_error_on_garbage() {
        let err = parse_probe_json(b"not json", Path::new("/x.mkv")).expect_err("must fail");
        assert!(matches!(err, ProbeError::ParseJson { .. }));
    }

    fn sdr_metadata() -> FileMetadata {
        parse_probe_json(fixture_h264_sdr().as_bytes(), Path::new("/x.mkv")).expect("parse")
    }

    fn hdr_metadata() -> FileMetadata {
        parse_probe_json(fixture_hevc_hdr().as_bytes(), Path::new("/x.mkv")).expect("parse")
    }

    fn assert_window_eq(haystack: &[String], needle: &[&str]) {
        let needle_owned: Vec<String> = needle.iter().map(|s| s.to_string()).collect();
        assert!(
            haystack
                .windows(needle.len())
                .any(|w| w == needle_owned.as_slice()),
            "expected window {needle:?} in {haystack:?}",
        );
    }

    #[test]
    fn software_argv_for_1080p_includes_libx264_and_scale() {
        let argv = build_encode_argv(
            &sdr_metadata(),
            &HwAccelConfig::Software,
            &profile_for(Resolution::R1080p),
            "/tmp/segments-rust/jjj/segment_%04d.m4s",
            false,
        );
        assert!(argv.pre_input.is_empty(), "software has no input options");
        // First-video + first-audio mapping, then libx264 codec.
        assert_window_eq(&argv.post_input, &["-map", "0:v:0"]);
        assert_window_eq(&argv.post_input, &["-map", "0:a:0"]);
        assert_window_eq(&argv.post_input, &["-c:v", "libx264"]);
        assert_window_eq(&argv.post_input, &["-c:a", "aac"]);
        // 1080p profile knobs.
        assert_window_eq(&argv.post_input, &["-b:v", "4000k"]);
        assert_window_eq(&argv.post_input, &["-maxrate", "4800k"]);
        assert_window_eq(&argv.post_input, &["-bufsize", "8000k"]);
        assert_window_eq(&argv.post_input, &["-level:v", "4.0"]);
        // Scale filter for software path includes the pad expression.
        let vf_idx = argv
            .post_input
            .iter()
            .position(|s| s == "-vf")
            .expect("-vf present");
        let vf = &argv.post_input[vf_idx + 1];
        assert!(vf.starts_with("scale=1920:1080:force_original_aspect_ratio=decrease,pad="));
        // In-band SPS/PPS bsf is applied.
        assert_window_eq(&argv.post_input, &["-bsf:v", "dump_extra=keyframe"]);
        // Direct fmp4 muxer with the requested chunk output path.
        assert_window_eq(&argv.post_input, &["-f", "mp4"]);
        assert_eq!(
            argv.post_input.last().map(String::as_str),
            Some("/tmp/segments-rust/jjj/segment_%04d.m4s")
        );
    }

    #[test]
    fn software_argv_inserts_pix_fmt_yuv420p_for_high_bit_depth_source() {
        // SDR fixture is 8-bit so pix_fmt is omitted.
        let argv_sdr = build_encode_argv(
            &sdr_metadata(),
            &HwAccelConfig::Software,
            &profile_for(Resolution::R1080p),
            "/tmp/x/segment_%04d.m4s",
            false,
        );
        assert!(
            !argv_sdr.post_input.contains(&"-pix_fmt".to_string()),
            "SDR source should not force -pix_fmt yuv420p"
        );

        // HDR fixture is 10-bit; libx264 only takes 8-bit, so the conversion
        // is forced.
        let argv_hdr = build_encode_argv(
            &hdr_metadata(),
            &HwAccelConfig::Software,
            &profile_for(Resolution::R1080p),
            "/tmp/x/segment_%04d.m4s",
            false,
        );
        assert_window_eq(&argv_hdr.post_input, &["-pix_fmt", "yuv420p"]);
    }

    #[test]
    fn vaapi_argv_for_sdr_uses_scale_plus_pad_vaapi() {
        let argv = build_encode_argv(
            &sdr_metadata(),
            &HwAccelConfig::Vaapi {
                device: "/dev/dri/renderD128".into(),
            },
            &profile_for(Resolution::R1080p),
            "/tmp/segments-rust/jjj/segment_%04d.m4s",
            false,
        );
        // Pre-input has the device-init flags.
        assert_window_eq(
            &argv.pre_input,
            &["-init_hw_device", "vaapi=va:/dev/dri/renderD128"],
        );
        assert_window_eq(&argv.pre_input, &["-hwaccel", "vaapi"]);
        assert_window_eq(&argv.pre_input, &["-hwaccel_output_format", "vaapi"]);
        // h264_vaapi codec is selected.
        assert_window_eq(&argv.post_input, &["-c:v", "h264_vaapi"]);
        // Filter chain has scale_vaapi + pad_vaapi for SDR (no tonemap, no sw-pad).
        let vf_idx = argv
            .post_input
            .iter()
            .position(|s| s == "-vf")
            .expect("-vf present");
        let vf = &argv.post_input[vf_idx + 1];
        assert!(vf.contains("scale_vaapi"));
        assert!(vf.contains("pad_vaapi"));
        assert!(!vf.contains("tonemap_vaapi"), "SDR must not run tonemap");
        assert!(
            !vf.contains("hwdownload"),
            "SDR fast path keeps frames on GPU"
        );
    }

    #[test]
    fn vaapi_argv_for_hdr_uses_tonemap_and_skips_pad() {
        let argv = build_encode_argv(
            &hdr_metadata(),
            &HwAccelConfig::Vaapi {
                device: "/dev/dri/renderD128".into(),
            },
            &profile_for(Resolution::R4k),
            "/tmp/x/segment_%04d.m4s",
            false,
        );
        let vf_idx = argv
            .post_input
            .iter()
            .position(|s| s == "-vf")
            .expect("-vf present");
        let vf = &argv.post_input[vf_idx + 1];
        assert!(
            vf.starts_with("tonemap_vaapi"),
            "HDR must lead with tonemap_vaapi"
        );
        assert!(vf.contains("scale_vaapi"));
        assert!(
            vf.contains("out_color_matrix=bt709"),
            "HDR scale tags surface as bt709"
        );
        assert!(!vf.contains("pad_vaapi"), "HDR must skip pad_vaapi");
        assert!(
            !vf.contains("hwdownload"),
            "HDR must not round-trip through CPU"
        );
    }

    #[test]
    fn vaapi_argv_with_sw_pad_inserts_hwdownload_pad_hwupload() {
        let argv = build_encode_argv(
            &sdr_metadata(),
            &HwAccelConfig::Vaapi {
                device: "/dev/dri/renderD128".into(),
            },
            &profile_for(Resolution::R1080p),
            "/tmp/x/segment_%04d.m4s",
            true,
        );
        let vf_idx = argv
            .post_input
            .iter()
            .position(|s| s == "-vf")
            .expect("-vf present");
        let vf = &argv.post_input[vf_idx + 1];
        assert!(vf.contains("hwdownload"));
        assert!(vf.contains("hwupload"));
        assert!(vf.contains("pad="));
        assert!(!vf.contains("pad_vaapi"));
    }

    #[test]
    fn vaapi_argv_for_hdr_ignores_sw_pad_flag() {
        // sw_pad is an SDR cascade tier; it does not apply to HDR. The
        // builder keeps the HDR chain intact regardless.
        let argv = build_encode_argv(
            &hdr_metadata(),
            &HwAccelConfig::Vaapi {
                device: "/dev/dri/renderD128".into(),
            },
            &profile_for(Resolution::R4k),
            "/tmp/x/segment_%04d.m4s",
            true, // sw_pad requested
        );
        let vf_idx = argv
            .post_input
            .iter()
            .position(|s| s == "-vf")
            .expect("-vf present");
        let vf = &argv.post_input[vf_idx + 1];
        assert!(vf.starts_with("tonemap_vaapi"));
        assert!(!vf.contains("hwdownload"), "HDR cascade ignores sw_pad");
    }

    #[test]
    fn vaapi_argv_4k_uses_15000k_bitrate_and_level_5_1() {
        let argv = build_encode_argv(
            &sdr_metadata(),
            &HwAccelConfig::Vaapi {
                device: "/dev/dri/renderD128".into(),
            },
            &profile_for(Resolution::R4k),
            "/tmp/x/segment_%04d.m4s",
            false,
        );
        assert_window_eq(&argv.post_input, &["-b:v", "15000k"]);
        assert_window_eq(&argv.post_input, &["-maxrate", "18000k"]);
        assert_window_eq(&argv.post_input, &["-bufsize", "30000k"]);
        assert_window_eq(&argv.post_input, &["-level:v", "5.1"]);
    }

    #[test]
    fn fmp4_muxer_options_emit_correct_movflags_and_output() {
        let p = profile_for(Resolution::R1080p);
        let opts = fmp4_muxer_options(&p, "/abs/path/chunk.fmp4");
        // -f mp4 (direct fmp4, NOT -f hls — see comment on the fn).
        assert_window_eq(&opts, &["-f", "mp4"]);
        // The four movflags load-bearing for CMAF + the
        // negative_cts_offsets fix that drops the elst.
        assert_window_eq(
            &opts,
            &[
                "-movflags",
                "+frag_keyframe+empty_moov+separate_moof+default_base_moof+negative_cts_offsets",
            ],
        );
        // Timestamp-shift flag actually applies in the direct fmp4
        // muxer (HLS-fmp4 wraps fmp4 and silently drops it).
        assert_window_eq(&opts, &["-avoid_negative_ts", "make_zero"]);
        // Fragment cadence aligned to the resolution profile's
        // segment_duration (1080p uses 2 s = 2_000_000 µs).
        assert_window_eq(&opts, &["-frag_duration", "2000000"]);
        // The growing-file output path is the LAST positional arg.
        assert_eq!(
            opts.last().map(String::as_str),
            Some("/abs/path/chunk.fmp4")
        );
    }

    #[test]
    fn hw_accel_kind_str_round_trips() {
        assert_eq!(HwAccelConfig::Software.kind_str(), "software");
        assert_eq!(
            HwAccelConfig::Vaapi {
                device: "/dev/dri/renderD128".into()
            }
            .kind_str(),
            "vaapi"
        );
        assert_eq!(HwAccelConfig::VideoToolbox.kind_str(), "videotoolbox");
    }
}
