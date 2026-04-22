/**
 * ffmpegPath — resolves the on-disk paths for the ffmpeg and ffprobe binaries.
 *
 * Priority:
 *   1. FFMPEG_PATH / FFPROBE_PATH env vars (dev override)
 *   2. vendor/ffmpeg/<platform>/ffmpeg[.exe] — the production pattern, populated
 *      by `bun run setup-ffmpeg` (downloads jellyfin-ffmpeg)
 *   3. System $PATH (dev fallback via `which ffmpeg`)
 *   4. Error — refuses to start; caller must surface the message
 *
 * Designed to match the Rust/Tauri rewrite's eventual bundling model: a
 * per-platform `vendor/ffmpeg/<platform>/` directory is included in the app
 * resources, and the same resolver logic finds it in production.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "../../..");
const VENDOR_ROOT = join(ROOT, "vendor", "ffmpeg");

export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
}

function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

function binName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function findOnPath(name: string): string | null {
  const which = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(which, [name], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const first = result.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
  return first ? first.trim() : null;
}

function resolveOne(envVar: string, base: "ffmpeg" | "ffprobe"): string {
  const override = process.env[envVar];
  if (override && existsSync(override)) return override;

  const vendored = join(VENDOR_ROOT, platformKey(), binName(base));
  if (existsSync(vendored)) return vendored;

  const onPath = findOnPath(base);
  if (onPath) return onPath;

  throw new Error(
    `Could not locate '${base}' binary. Tried:\n` +
      `  1. ${envVar} env var (unset or file missing)\n` +
      `  2. ${vendored}\n` +
      `  3. system PATH\n\n` +
      `Run 'bun run setup-ffmpeg' from the project root to download a working binary, ` +
      `or set ${envVar} to point at an existing ffmpeg/ffprobe.`
  );
}

let cached: FfmpegPaths | null = null;

export function resolveFfmpegPaths(): FfmpegPaths {
  if (cached) return cached;
  cached = {
    ffmpeg: resolveOne("FFMPEG_PATH", "ffmpeg"),
    ffprobe: resolveOne("FFPROBE_PATH", "ffprobe"),
  };
  return cached;
}
