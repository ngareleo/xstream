#!/usr/bin/env bun
/**
 * setup-ffmpeg — downloads a jellyfin-ffmpeg portable build for the current
 * platform into `vendor/ffmpeg/<platform>/`.
 *
 * Jellyfin-ffmpeg is used (not @ffmpeg-installer) because it ships static
 * builds with every HW-accel backend compiled in (VAAPI, QSV, NVENC, AMF,
 * VideoToolbox, D3D11VA depending on target), and publishes per-platform
 * assets on every release — the same pattern the Rust/Tauri rewrite will bundle.
 *
 * Usage:
 *   bun run setup-ffmpeg          # idempotent; skips if vendor/ is populated
 *   bun run setup-ffmpeg --force  # re-download even if present
 */

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const REPO = "jellyfin/jellyfin-ffmpeg";
const ROOT = resolve(import.meta.dir, "..");
const VENDOR_ROOT = join(ROOT, "vendor", "ffmpeg");
const DOWNLOAD_DIR = join(ROOT, "tmp");

const FORCE = process.argv.includes("--force");

type Platform = "linux-x64" | "linux-arm64" | "darwin-x64" | "darwin-arm64" | "win32-x64" | "win32-arm64";

function detectPlatform(): Platform {
  const key = `${process.platform}-${process.arch}`;
  switch (key) {
    case "linux-x64":
    case "linux-arm64":
    case "darwin-x64":
    case "darwin-arm64":
    case "win32-x64":
    case "win32-arm64":
      return key;
    default:
      throw new Error(`Unsupported platform: ${key}`);
  }
}

/** Asset-name fragments identifying the right jellyfin-ffmpeg portable build
 *  for each platform, plus the archive extension. */
const ASSET_MATCHERS: Record<Platform, { fragment: string; ext: ".tar.xz" | ".zip" }> = {
  "linux-x64":    { fragment: "portable_linux64-gpl",      ext: ".tar.xz" },
  "linux-arm64":  { fragment: "portable_linuxarm64-gpl",   ext: ".tar.xz" },
  "darwin-x64":   { fragment: "portable_mac64-gpl",        ext: ".tar.xz" },
  "darwin-arm64": { fragment: "portable_macarm64-gpl",     ext: ".tar.xz" },
  "win32-x64":    { fragment: "portable_win64-clang-gpl",  ext: ".zip" },
  "win32-arm64":  { fragment: "portable_winarm64-clang-gpl", ext: ".zip" },
};

function binName(base: string): string {
  return process.platform === "win32" ? `${base}.exe` : base;
}

function isFfmpegPresent(dir: string): boolean {
  const ffmpeg = join(dir, binName("ffmpeg"));
  const ffprobe = join(dir, binName("ffprobe"));
  return existsSync(ffmpeg) && existsSync(ffprobe);
}

async function fetchLatestAssetUrl(platform: Platform): Promise<{ url: string; version: string; name: string }> {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
  const data = (await res.json()) as {
    tag_name: string;
    assets: Array<{ name: string; browser_download_url: string }>;
  };
  const matcher = ASSET_MATCHERS[platform];
  const asset = data.assets.find(
    (a) => a.name.includes(matcher.fragment) && a.name.endsWith(matcher.ext)
  );
  if (!asset) {
    throw new Error(
      `No asset found matching '${matcher.fragment}${matcher.ext}' in release ${data.tag_name}. ` +
        `Available: ${data.assets.map((a) => a.name).join(", ")}`
    );
  }
  return { url: asset.browser_download_url, version: data.tag_name, name: asset.name };
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download ${url} failed: ${res.status} ${res.statusText}`);
  await mkdir(dirname(dest), { recursive: true });
  await Bun.write(dest, res);
}

function extract(archivePath: string, destDir: string): void {
  // bsdtar (macOS) and GNU tar both support `-xJf` for tar.xz; Windows 10+ ships
  // bsdtar which also handles .zip via `tar -xf`. For maximum portability we
  // dispatch on the archive extension.
  const isZip = archivePath.endsWith(".zip");
  const args = isZip ? ["-xf", archivePath, "-C", destDir] : ["-xJf", archivePath, "-C", destDir];
  const result = spawnSync("tar", args, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`tar extraction failed (exit ${result.status}). Ensure 'tar' is on PATH.`);
  }
}

/** Find ffmpeg + ffprobe anywhere under `searchDir` and move them to `targetDir`. */
function relocateBinaries(searchDir: string, targetDir: string): void {
  const wanted = new Set([binName("ffmpeg"), binName("ffprobe")]);
  const found = new Map<string, string>();

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (wanted.has(entry) && !found.has(entry)) found.set(entry, full);
    }
  };
  walk(searchDir);

  for (const name of wanted) {
    const src = found.get(name);
    if (!src) throw new Error(`Extracted archive did not contain '${name}'.`);
    renameSync(src, join(targetDir, name));
  }
}

function chmodExec(path: string): void {
  if (process.platform === "win32") return;
  const result = spawnSync("chmod", ["+x", path], { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`chmod +x ${path} failed`);
}

function verify(binPath: string): void {
  const result = spawnSync(binPath, ["-version"], { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`Verification failed for ${binPath}: ${result.stderr || result.stdout}`);
  }
  const firstLine = (result.stdout || "").split("\n")[0];
  console.log(`  ✓ ${binPath} — ${firstLine}`);
}

async function main(): Promise<void> {
  const platform = detectPlatform();
  const vendorDir = join(VENDOR_ROOT, platform);
  const ffmpegPath = join(vendorDir, binName("ffmpeg"));
  const ffprobePath = join(vendorDir, binName("ffprobe"));

  console.log(`Platform: ${platform}`);
  console.log(`Vendor dir: ${vendorDir}`);

  if (!FORCE && isFfmpegPresent(vendorDir)) {
    console.log("\nffmpeg + ffprobe already present. Use --force to re-download.");
    verify(ffmpegPath);
    verify(ffprobePath);
    return;
  }

  console.log(`\nFetching latest release from ${REPO}...`);
  const { url, version, name } = await fetchLatestAssetUrl(platform);
  console.log(`  ${version} → ${name}`);

  await mkdir(DOWNLOAD_DIR, { recursive: true });
  const archivePath = join(DOWNLOAD_DIR, name);

  console.log(`\nDownloading ${url}`);
  await download(url, archivePath);
  console.log(`  saved to ${archivePath}`);

  // Extract into a scratch dir under tmp/, then relocate the two binaries to
  // vendor/. This isolates us from whatever directory layout jellyfin-ffmpeg
  // uses inside the tarball (it varies between releases).
  const scratchDir = join(DOWNLOAD_DIR, `ffmpeg-extract-${Date.now()}`);
  await mkdir(scratchDir, { recursive: true });
  console.log(`\nExtracting to ${scratchDir}`);
  extract(archivePath, scratchDir);

  await mkdir(vendorDir, { recursive: true });
  console.log(`\nRelocating binaries to ${vendorDir}`);
  relocateBinaries(scratchDir, vendorDir);

  chmodExec(ffmpegPath);
  chmodExec(ffprobePath);

  rmSync(scratchDir, { recursive: true, force: true });
  rmSync(archivePath, { force: true });

  console.log("\nVerifying binaries:");
  verify(ffmpegPath);
  verify(ffprobePath);

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(`\nsetup-ffmpeg failed: ${err.message}`);
  process.exit(1);
});
