/**
 * hwAccel — runtime detection of hardware-accelerated video encode backends.
 *
 * The server probes at startup for a platform-appropriate HW path. Success
 * caches a tagged-union config that the ffmpeg command builder and chunker
 * read synchronously.
 *
 * Policy: if HW_ACCEL=auto (the default) and the probe fails, the server
 * exits with a clear diagnostic — NOT silently falling back to software.
 * Software 4K encode has been measured at ~0.8× realtime on modern desktop
 * CPUs and produces continuous playback stalls; shipping that by default
 * would mask real infrastructure regressions. Users who deliberately want
 * software mode set HW_ACCEL=off; per-chunk fallback still uses software
 * when a transient HW error hits mid-session.
 *
 * Today only the VAAPI branch is fully implemented; macOS (VideoToolbox)
 * and Windows (QSV / NVENC / AMF) variants are present in the type system
 * and throw on probe so the Rust/Tauri port has an obvious checklist.
 */
import { spawnSync } from "node:child_process";

import { getOtelLogger } from "../telemetry/index.js";

const log = getOtelLogger("hwAccel");

export type HwAccelKind = "software" | "vaapi" | "videotoolbox" | "qsv" | "nvenc" | "amf";

export type HwAccelConfig =
  | { kind: "software" }
  | { kind: "vaapi"; device: string }
  | { kind: "videotoolbox" }
  | { kind: "qsv" }
  | { kind: "nvenc" }
  | { kind: "amf" };

const DEFAULT_VAAPI_DEVICE = "/dev/dri/renderD128";

let detected: HwAccelConfig | null = null;

/**
 * Returns the memoised HW accel config decided at startup. Throws if called
 * before `detectHwAccel()` — the server's startup sequence must probe first.
 */
export function getHwAccelConfig(): HwAccelConfig {
  if (!detected) {
    throw new Error(
      "getHwAccelConfig() called before detectHwAccel(). The server must probe HW accel during startup."
    );
  }
  return detected;
}

/**
 * Probe the environment and cache the resulting config. Called once at
 * server startup from `index.ts`. Exits the process on fatal HW misconfig
 * (see module doc for rationale).
 */
export async function detectHwAccel(
  ffmpegPath: string,
  mode: "auto" | "off"
): Promise<HwAccelConfig> {
  if (detected) return detected;

  if (mode === "off") {
    log.info("Hardware acceleration explicitly disabled (HW_ACCEL=off) — software encode", {
      mode,
    });
    detected = { kind: "software" };
    return detected;
  }

  if (process.platform === "linux") {
    const ok = probeVaapi(ffmpegPath, DEFAULT_VAAPI_DEVICE);
    if (ok.ok) {
      detected = { kind: "vaapi", device: DEFAULT_VAAPI_DEVICE };
      log.info(`Hardware acceleration selected — vaapi (${DEFAULT_VAAPI_DEVICE})`, {
        kind: "vaapi",
        device: DEFAULT_VAAPI_DEVICE,
      });
      return detected;
    }
    fatal(
      `Hardware acceleration probe failed on linux.\n` +
        `  device: ${DEFAULT_VAAPI_DEVICE}\n` +
        `  exit:   ${ok.exit}\n` +
        `  stderr: ${ok.stderr.slice(0, 800)}\n\n` +
        `Common causes:\n` +
        `  • GPU driver too old for your hardware (Lunar Lake needs intel-media-driver 24.2.0+)\n` +
        `  • User not in 'render' group or ACL missing on ${DEFAULT_VAAPI_DEVICE}\n` +
        `  • Running inside a container/VM without GPU passthrough\n\n` +
        `Set HW_ACCEL=off to force software mode (note: software 4K encode stalls continuously).`
    );
  }

  if (process.platform === "darwin") {
    fatal(
      `HW accel on darwin not yet implemented.\n` +
        `Set HW_ACCEL=off to run software encode, or contribute a videotoolbox implementation ` +
        `in server/src/services/hwAccel.ts + the 'videotoolbox' branch in ffmpegFile.applyOutputOptions.`
    );
  }

  if (process.platform === "win32") {
    fatal(
      `HW accel on win32 not yet implemented.\n` +
        `Set HW_ACCEL=off to run software encode, or contribute a qsv/nvenc/amf implementation ` +
        `in server/src/services/hwAccel.ts + the matching branch in ffmpegFile.applyOutputOptions.`
    );
  }

  fatal(`Unsupported platform: ${process.platform}. Set HW_ACCEL=off to force software mode.`);
}

/**
 * VAAPI smoke test. Runs a 0.1 s synthetic encode through h264_vaapi; exit
 * code 0 means the device initialised and the encoder produced frames.
 */
function probeVaapi(
  ffmpegPath: string,
  device: string
): { ok: true } | { ok: false; exit: number | null; stderr: string } {
  const args = [
    "-hide_banner",
    "-v",
    "error",
    "-init_hw_device",
    `vaapi=va:${device}`,
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=0.1:size=320x240:rate=24",
    "-vf",
    "format=nv12,hwupload",
    "-c:v",
    "h264_vaapi",
    "-qp",
    "23",
    "-f",
    "null",
    "-",
  ];
  const result = spawnSync(ffmpegPath, args, { encoding: "utf8", timeout: 10_000 });
  if (result.status === 0) return { ok: true };
  return { ok: false, exit: result.status, stderr: result.stderr || result.stdout || "" };
}

/** Log a fatal error and exit the process. The OTel log call is best-effort
 *  for Seq; the plain stderr write guarantees the user sees it in the
 *  terminal even if OTel export hasn't flushed yet. */
function fatal(message: string): never {
  log.error(`Hardware acceleration startup failed:\n${message}`, {});
  process.stderr.write(`\n[xstream] Hardware acceleration startup failed:\n${message}\n\n`);
  process.exit(1);
}
