import type { Resolution } from "~/types.js";

export function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

/** HH:MM:SS / MM:SS — used in the player control bar */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "148 min" — used in list/detail views */
export function formatDurationHuman(seconds: number): string {
  const m = Math.round(seconds / 60);
  return `${m} min`;
}

export function resolutionLabel(
  height: number | null | undefined,
  width?: number | null
): Resolution | null {
  if (!height) return null;
  // 4K: either height >= 2160 (16:9) or width >= 3840 (cinemascope sources like 3840×1600)
  if (height >= 2160 || (width ?? 0) >= 3840) return "4k";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  if (height >= 360) return "360p";
  return "240p";
}

export function maxResolutionForHeight(
  height: number | null | undefined,
  width?: number | null
): Resolution {
  return resolutionLabel(height, width) ?? "240p";
}

/**
 * Upgrades an OMDb / Amazon `m.media-amazon.com` poster URL to a target
 * width. The CDN puts a chain of `_XXnnn` modifiers (and `_CR<crop>`
 * runs) between `._V1_` and the file extension — for example
 * `_V1_SX300.jpg` (only width set) or
 * `_V1_QL75_UY562_CR35,0,380,562_.jpg` (quality + height + crop, no
 * `_SX` at all). Strip the whole modifier block and replace it with a
 * single `_SX<width>` so the CDN always serves the size we want. Pass
 * non-Amazon URLs through unchanged.
 */
export function upgradePosterUrl(url: string, width = 800): string {
  if (!url.includes("._V1_")) return url;
  return url.replace(/(\._V1_)[^.]*(\.[a-z0-9]+)$/i, `$1SX${width}$2`);
}
