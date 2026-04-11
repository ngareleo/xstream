import type { Resolution } from "~/types.js";

export function formatFileSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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
