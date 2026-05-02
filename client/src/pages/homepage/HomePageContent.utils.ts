import type { HomePageContentQuery } from "~/relay/__generated__/HomePageContentQuery.graphql.js";
import { type Codec, type FilterableFilm, type Hdr, type Resolution } from "~/utils/filters.js";

import { strings } from "./HomePage.strings.js";

export type VideoEdge = NonNullable<HomePageContentQuery["response"]["videos"]>["edges"][number];
export type VideoNode = VideoEdge["node"];

export interface FilterRow extends FilterableFilm {
  id: string;
  title: string;
  filename: string;
  director: string;
  genre: string;
  node: VideoNode;
}

const RESOLUTION_LABEL: Record<string, Resolution> = {
  RESOLUTION_4K: "4K",
  RESOLUTION_1080P: "1080p",
  RESOLUTION_720P: "720p",
};

export function toFilterRow(node: VideoNode): FilterRow {
  const codec = (node.videoStream?.codec ?? "HEVC") as Codec;
  const resolution: Resolution = node.nativeResolution
    ? (RESOLUTION_LABEL[node.nativeResolution] ?? "1080p")
    : "1080p";
  return {
    id: node.id,
    title: (node.title || "").toLowerCase(),
    filename: node.filename.toLowerCase(),
    director: (node.metadata?.director ?? "").toLowerCase(),
    genre: (node.metadata?.genre ?? "").toLowerCase(),
    resolution,
    hdr: null as Hdr | null,
    codec,
    year: node.metadata?.year ?? null,
    node,
  };
}

export function timeOfDayGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return strings.greetingMorning;
  if (h < 18) return strings.greetingAfternoon;
  return strings.greetingEvening;
}

export function pickSuggestions(film: FilterRow, all: FilterRow[]): VideoNode[] {
  const tokens = film.genre.split(/[·\s/]+/).filter(Boolean);
  const scored: { row: FilterRow; score: number }[] = [];
  for (const f of all) {
    if (f.id === film.id) continue;
    let score = 0;
    if (f.director && film.director && f.director === film.director) score += 50;
    for (const t of tokens) {
      if (t.length > 2 && f.genre.includes(t)) score += 12;
    }
    if (f.resolution === film.resolution) score += 2;
    scored.push({ row: f, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 8).map((s) => s.row.node);
}
