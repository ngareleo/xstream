import type { HomeFilmsSection_films$data } from "~/relay/__generated__/HomeFilmsSection_films.graphql.js";
import { type Codec, type FilterableFilm, type Hdr, type Resolution } from "~/utils/filters.js";

import { strings } from "./HomeFilmsSection.strings.js";

export type FilmData = HomeFilmsSection_films$data["edges"][number]["node"];
export type VideoData = FilmData["bestCopy"];

export interface FilterRow extends FilterableFilm {
  id: string;
  title: string;
  filename: string;
  director: string;
  genre: string;
  /** The Film's `bestCopy` Video — what FilmTile / FilmDetailsOverlay
   *  fragments render against. Carries spread fragment refs. */
  node: VideoData;
  /** All copies of the Film, in res-desc/bitrate-desc order — drives the
   *  FilmVariants picker. Always populated for movies (≥1 copy). */
  copies: ReadonlyArray<VideoData>;
}

const RESOLUTION_LABEL: Record<string, Resolution> = {
  RESOLUTION_4K: "4K",
  RESOLUTION_1080P: "1080p",
  RESOLUTION_720P: "720p",
};

interface NodeShape {
  readonly nativeResolution: string | null | undefined;
  readonly videoStream: { readonly codec: string } | null | undefined;
}

function deriveFilters(
  node: NodeShape,
  metaDirector: string | null | undefined,
  metaGenre: string | null | undefined,
  metaYear: number | null | undefined
) {
  const codec = (node.videoStream?.codec ?? "HEVC") as Codec;
  const resolution: Resolution = node.nativeResolution
    ? (RESOLUTION_LABEL[node.nativeResolution] ?? "1080p")
    : "1080p";
  return {
    director: (metaDirector ?? "").toLowerCase(),
    genre: (metaGenre ?? "").toLowerCase(),
    resolution,
    hdr: null as Hdr | null,
    codec,
    year: metaYear ?? null,
  };
}

export function toFilterRowFromFilm(film: FilmData): FilterRow {
  const best = film.bestCopy;
  const filters = deriveFilters(
    best,
    film.metadata?.director,
    film.metadata?.genre,
    film.metadata?.year ?? film.year ?? null
  );
  return {
    id: film.id,
    title: (film.title || "").toLowerCase(),
    filename: best.filename.toLowerCase(),
    ...filters,
    node: best,
    copies: film.copies,
  };
}

export function timeOfDayGreeting(now: Date): string {
  const h = now.getHours();
  if (h < 12) return strings.greetingMorning;
  if (h < 18) return strings.greetingAfternoon;
  return strings.greetingEvening;
}

export function pickSuggestions(film: FilterRow, all: FilterRow[]): VideoData[] {
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
