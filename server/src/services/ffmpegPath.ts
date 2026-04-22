/**
 * ffmpegPath — resolves the on-disk paths for the ffmpeg and ffprobe binaries.
 *
 * The manifest at `scripts/ffmpeg-manifest.json` pins one exact jellyfin-ffmpeg
 * version per platform. This resolver finds the binary installed by
 * `bun run setup-ffmpeg` at the platform-specific location the manifest
 * commits us to, and verifies its version string matches. Any drift is a
 * fatal error with a clear pointer to re-run setup.
 *
 * Priority:
 *   1. FFMPEG_PATH / FFPROBE_PATH env vars (explicit override — bypasses the
 *      version check; intended for dev experimentation, not production).
 *   2. Platform-specific installed location:
 *        linux-x64 / linux-arm64 → `/usr/lib/jellyfin-ffmpeg/{ffmpeg,ffprobe}`
 *        darwin-* / win32-x64    → `vendor/ffmpeg/<platform>/{ffmpeg,ffprobe}[.exe]`
 *   3. No fallback. Missing binary → fatal, with a message pointing to
 *      `bun run setup-ffmpeg`. No system $PATH lookup — we're opinionated
 *      about the exact version we run against.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import ffmpeg from "fluent-ffmpeg";

const ROOT = resolve(import.meta.dir, "../../..");
const MANIFEST_PATH = join(ROOT, "scripts", "ffmpeg-manifest.json");
const VENDOR_ROOT = join(ROOT, "vendor", "ffmpeg");

interface PlatformEntry {
  asset: string;
  sha256: string;
  strategy: "deb-install" | "portable-tarball" | "portable-zip";
  installedPrefix?: string;
}

interface FfmpegManifest {
  ffmpeg: {
    distribution: string;
    version: string;
    versionString: string;
    platforms: Record<string, PlatformEntry>;
  };
}

export interface FfmpegPaths {
  ffmpeg: string;
  ffprobe: string;
  /** The version string the resolver validated, for telemetry + logs. */
  versionString: string;
}

function platformKey(): string {
  return `${process.platform}-${process.arch}`;
}

function binName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function loadManifest(): FfmpegManifest {
  const raw = readFileSync(MANIFEST_PATH, "utf8");
  return JSON.parse(raw) as FfmpegManifest;
}

/** Where the manifest's install strategy places each binary. */
function installedPath(entry: PlatformEntry, base: "ffmpeg" | "ffprobe"): string {
  if (entry.strategy === "deb-install") {
    const prefix = entry.installedPrefix ?? "/usr/lib/jellyfin-ffmpeg";
    return join(prefix, base);
  }
  return join(VENDOR_ROOT, platformKey(), binName(base));
}

function runVersion(binPath: string): string | null {
  const result = spawnSync(binPath, ["-version"], { encoding: "utf8" });
  if (result.status !== 0) return null;
  const firstLine = (result.stdout ?? "").split("\n")[0];
  const match = firstLine.match(/ffmpeg version (\S+)/) ?? firstLine.match(/ffprobe version (\S+)/);
  return match ? match[1] : null;
}

let cached: FfmpegPaths | null = null;

/**
 * Resolve the ffmpeg + ffprobe paths pinned by the manifest.
 * Memoised — first call does the version check, subsequent calls return cached.
 */
export function resolveFfmpegPaths(): FfmpegPaths {
  if (cached) return cached;

  const manifest = loadManifest();
  const platform = platformKey();
  const entry = manifest.ffmpeg.platforms[platform];
  if (!entry) {
    throw new Error(
      `Platform '${platform}' is not supported. Supported platforms (from scripts/ffmpeg-manifest.json): ${Object.keys(manifest.ffmpeg.platforms).join(", ")}`
    );
  }

  const expectedVersion = manifest.ffmpeg.versionString;

  // 1. Env var override — skip version check (explicit "I know what I'm doing")
  const envFfmpeg = process.env.FFMPEG_PATH;
  const envFfprobe = process.env.FFPROBE_PATH;
  if (envFfmpeg && envFfprobe && existsSync(envFfmpeg) && existsSync(envFfprobe)) {
    const version = runVersion(envFfmpeg) ?? "(unknown)";
    cached = { ffmpeg: envFfmpeg, ffprobe: envFfprobe, versionString: version };
    applyToFluentFfmpeg(cached);
    return cached;
  }

  // 2. Manifest-prescribed install location
  const ffmpegPath = installedPath(entry, "ffmpeg");
  const ffprobePath = installedPath(entry, "ffprobe");

  if (!existsSync(ffmpegPath) || !existsSync(ffprobePath)) {
    throw new Error(
      `ffmpeg binaries are not installed at the expected location for ${platform}.\n` +
        `  Expected: ${ffmpegPath}\n` +
        `            ${ffprobePath}\n\n` +
        `Run 'bun run setup-ffmpeg' from the project root to install the pinned ` +
        `version (${manifest.ffmpeg.distribution} ${manifest.ffmpeg.version}).`
    );
  }

  // 3. Version check — binary exists, does its version match the manifest?
  const actualVersion = runVersion(ffmpegPath);
  if (actualVersion !== expectedVersion) {
    throw new Error(
      `ffmpeg version mismatch at ${ffmpegPath}\n` +
        `  expected: ${expectedVersion}\n` +
        `  actual:   ${actualVersion ?? "(could not parse)"}\n\n` +
        `The installed binary has drifted from the manifest pin. Run ` +
        `'bun run setup-ffmpeg --force' to re-install the pinned version, or ` +
        `update scripts/ffmpeg-manifest.json if you intended to bump the version.`
    );
  }

  cached = { ffmpeg: ffmpegPath, ffprobe: ffprobePath, versionString: actualVersion };
  applyToFluentFfmpeg(cached);
  return cached;
}

// fluent-ffmpeg caches its binary paths at module scope; the last caller wins
// regardless of load order. We wire it here — exactly once, inside the memoised
// resolver — so service modules never need their own setFfmpegPath call (which
// would clobber this and is a common source of VAAPI probe failures).
function applyToFluentFfmpeg(paths: FfmpegPaths): void {
  ffmpeg.setFfmpegPath(paths.ffmpeg);
  ffmpeg.setFfprobePath(paths.ffprobe);
}
