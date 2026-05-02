import { type Film } from "../../data/mock.js";

export type Resolution = Film["resolution"];
export type Hdr = "DV" | "HDR10" | "HDR10+" | "—";
export type Codec = Film["codec"];

export interface Filters {
  resolutions: Set<Resolution>;
  hdrs: Set<Hdr>;
  codecs: Set<Codec>;
  decades: Set<number>;
}

export const RESOLUTIONS: Resolution[] = ["4K", "1080p", "720p"];
export const HDRS: Hdr[] = ["DV", "HDR10", "HDR10+", "—"];
export const CODECS: Codec[] = ["HEVC", "H264", "AV1"];
export const DECADES: { decade: number; label: string }[] = [
  { decade: 1990, label: "'90s" },
  { decade: 2000, label: "'00s" },
  { decade: 2010, label: "'10s" },
  { decade: 2020, label: "'20s" },
];

export const EMPTY_FILTERS: Filters = {
  resolutions: new Set<Resolution>(),
  hdrs: new Set<Hdr>(),
  codecs: new Set<Codec>(),
  decades: new Set<number>(),
};

export function filtersActive(f: Filters): number {
  return f.resolutions.size + f.hdrs.size + f.codecs.size + f.decades.size;
}

export function applyFilters(list: Film[], f: Filters): Film[] {
  if (filtersActive(f) === 0) return list;
  return list.filter((film) => {
    if (f.resolutions.size > 0 && !f.resolutions.has(film.resolution)) {
      return false;
    }
    if (f.hdrs.size > 0) {
      const hdr = (film.hdr ?? "—") as Hdr;
      if (!f.hdrs.has(hdr)) return false;
    }
    if (f.codecs.size > 0 && !f.codecs.has(film.codec)) return false;
    if (f.decades.size > 0) {
      if (film.year === null) return false;
      const decade = Math.floor(film.year / 10) * 10;
      if (!f.decades.has(decade)) return false;
    }
    return true;
  });
}

export function toggleSetItem<T>(set: Set<T>, item: T): Set<T> {
  const next = new Set(set);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}
