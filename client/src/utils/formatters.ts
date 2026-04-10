import type { Resolution } from "../types.js";

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function resolutionLabel(height: number | null | undefined): Resolution | null {
  if (!height) return null;
  if (height >= 2160) return "4k";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 480) return "480p";
  if (height >= 360) return "360p";
  return "240p";
}

export function maxResolutionForHeight(height: number | null | undefined): Resolution {
  return resolutionLabel(height) ?? "240p";
}
