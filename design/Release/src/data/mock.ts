/**
 * Mock data for the Xstream design lab.
 * Seeded from `/home/dag/Downloads/app-mockups.jsx` POSTERS (Oppenheimer,
 * Barbie, Nosferatu, Civil War — real OMDb poster URLs) and expanded to
 * populate the library grid + multiple profiles.
 *
 * Mirrors the Profile / Film / WatchlistItem shapes used by the Prerelease
 * lab so future refactors that share types stay trivial.
 */

export interface Film {
  id: string;
  title: string | null;
  year: number | null;
  genre: string | null;
  director: string | null;
  cast: string[];
  rating: number | null;
  duration: string;
  resolution: "4K" | "1080p" | "720p";
  codec: "HEVC" | "H264" | "AV1";
  audio: string;
  audioChannels: string;
  size: string;
  bitrate: string;
  frameRate: string;
  container: string;
  hdr: "DV" | "HDR10" | "HDR10+" | "—" | null;
  profile: string;
  filename: string;
  matched: boolean;
  posterUrl: string | null;
  plot: string | null;
}

export interface Profile {
  id: string;
  name: string;
  path: string;
  type: "movies" | "tv" | "mixed";
  filmCount?: number;
  showCount?: number;
  episodeCount?: number;
  size: string;
  matched: number;
  total: number;
  unmatched: number;
  scanning: boolean;
  scanProgress?: { done: number; total: number };
}

export interface WatchlistItem {
  id: string;
  filmId: string;
  title: string;
  year: number;
  genre: string;
  duration: string;
  resolution: "4K" | "1080p" | "720p";
  addedAt: string;
  progress?: number;
  notes?: string;
}

/* ---------- The four canonical films from the Figma JSX ---------- */

const POSTER_URLS = {
  oppenheimer:
    "https://m.media-amazon.com/images/M/MV5BN2JkMDc5MGQtZjg3YS00NmFiLWIyZmQtZTJmNTM5MjVmYTQ4XkEyXkFqcGdeQXVyNzAwMjU2MTY@._V1_SX600.jpg",
  barbie:
    "https://m.media-amazon.com/images/M/MV5BNjU3N2QxNzYtMjk1NC00MTc4LTk1NTQtMmUxNTljM2I0NDA5XkEyXkFqcGdeQXVyODE5NzE3OTE@._V1_SX600.jpg",
  nosferatu:
    "https://m.media-amazon.com/images/M/MV5BNzZjMjI3YTYtMTY0YS00ZTU2LWE5YjMtMmFhMjkyNzgyMmE2XkEyXkFqcGc@._V1_SX600.jpg",
  civilwar:
    "https://m.media-amazon.com/images/M/MV5BNzdmMjMxNGItM2YyOS00ODc3LTlmMmUtMmIxZDdhYWY3OWQ0XkEyXkFqcGdeQXVyMTA3MDk2NDg2._V1_SX600.jpg",
} as const;

export type PosterId = keyof typeof POSTER_URLS;

export function getPosterUrl(id: PosterId): string {
  return POSTER_URLS[id];
}

/* ---------- Profiles (libraries) ---------- */

export const profiles: Profile[] = [
  {
    id: "films-4k",
    name: "Films / 4K UHD",
    path: "/media/films/4k",
    type: "movies",
    filmCount: 92,
    size: "1.4 TB",
    matched: 92,
    total: 92,
    unmatched: 0,
    scanning: false,
  },
  {
    id: "films-1080",
    name: "Films / 1080p",
    path: "/media/films/hd",
    type: "movies",
    filmCount: 187,
    size: "820 GB",
    matched: 186,
    total: 187,
    unmatched: 1,
    scanning: false,
  },
  {
    id: "tv",
    name: "TV / Limited Series",
    path: "/media/tv",
    type: "tv",
    showCount: 28,
    episodeCount: 194,
    size: "640 GB",
    matched: 28,
    total: 28,
    unmatched: 0,
    scanning: false,
  },
  {
    id: "docs",
    name: "Documentaries",
    path: "/media/docs",
    type: "movies",
    filmCount: 5,
    size: "32 GB",
    matched: 4,
    total: 5,
    unmatched: 1,
    scanning: true,
    scanProgress: { done: 4, total: 5 },
  },
];

/* ---------- Films ---------- */

export const films: Film[] = [
  {
    id: "oppenheimer",
    title: "Oppenheimer",
    year: 2023,
    genre: "Drama · Biography",
    director: "Christopher Nolan",
    cast: ["Cillian Murphy", "Emily Blunt", "Matt Damon", "Robert Downey Jr."],
    rating: 8.2,
    duration: "3h 1m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "62 GB",
    bitrate: "~60 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "DV",
    profile: "films-4k",
    filename: "Oppenheimer.2023.2160p.UHD.BluRay.HEVC.mkv",
    matched: true,
    posterUrl: POSTER_URLS.oppenheimer,
    plot: "A dramatization of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II — and the moral reckoning that followed.",
  },
  {
    id: "nosferatu",
    title: "Nosferatu",
    year: 2024,
    genre: "Horror · Gothic",
    director: "Robert Eggers",
    cast: ["Bill Skarsgård", "Lily-Rose Depp", "Nicholas Hoult"],
    rating: 7.1,
    duration: "2h 12m",
    resolution: "4K",
    codec: "HEVC",
    audio: "DTS-HD MA",
    audioChannels: "5.1",
    size: "48 GB",
    bitrate: "~52 Mbps",
    frameRate: "24 fps",
    container: "MKV",
    hdr: "DV",
    profile: "films-4k",
    filename: "Nosferatu.2024.2160p.HDR.mkv",
    matched: true,
    posterUrl: POSTER_URLS.nosferatu,
    plot: "A gothic tale of obsession between a haunted young woman and the terrifying vampire infatuated with her, causing untold horror in its wake.",
  },
  {
    id: "barbie",
    title: "Barbie",
    year: 2023,
    genre: "Comedy · Fantasy",
    director: "Greta Gerwig",
    cast: ["Margot Robbie", "Ryan Gosling", "America Ferrera"],
    rating: 6.8,
    duration: "1h 54m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "44 GB",
    bitrate: "~48 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "films-4k",
    filename: "Barbie.2023.2160p.HDR.mkv",
    matched: true,
    posterUrl: POSTER_URLS.barbie,
    plot: "Barbie suffers a crisis that leads her to question her world and her existence.",
  },
  {
    id: "civilwar",
    title: "Civil War",
    year: 2024,
    genre: "Action · Drama",
    director: "Alex Garland",
    cast: ["Kirsten Dunst", "Wagner Moura", "Cailee Spaeny"],
    rating: 7.0,
    duration: "1h 49m",
    resolution: "1080p",
    codec: "H264",
    audio: "DTS",
    audioChannels: "5.1",
    size: "14 GB",
    bitrate: "~12 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "—",
    profile: "films-1080",
    filename: "Civil.War.2024.1080p.mkv",
    matched: true,
    posterUrl: POSTER_URLS.civilwar,
    plot: "A journey across a dystopian future America, following a team of military-embedded journalists as they race against time to reach DC before rebel factions descend upon the White House.",
  },
  /* ---------- Synthetic entries to populate the library grid ---------- */
  {
    id: "oppenheimer-cut",
    title: "Oppenheimer (Director's Cut)",
    year: 2023,
    genre: "Drama · Biography",
    director: "Christopher Nolan",
    cast: ["Cillian Murphy"],
    rating: 8.4,
    duration: "3h 24m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "78 GB",
    bitrate: "~64 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "DV",
    profile: "films-4k",
    filename: "Oppenheimer.2023.Director.Cut.2160p.mkv",
    matched: true,
    posterUrl: POSTER_URLS.oppenheimer,
    plot: null,
  },
  {
    id: "nosferatu-bw",
    title: "Nosferatu (B&W Print)",
    year: 2024,
    genre: "Horror · Gothic",
    director: "Robert Eggers",
    cast: ["Bill Skarsgård"],
    rating: 7.3,
    duration: "2h 12m",
    resolution: "4K",
    codec: "HEVC",
    audio: "DTS-HD MA",
    audioChannels: "5.1",
    size: "46 GB",
    bitrate: "~50 Mbps",
    frameRate: "24 fps",
    container: "MKV",
    hdr: "DV",
    profile: "films-4k",
    filename: "Nosferatu.2024.BW.2160p.mkv",
    matched: true,
    posterUrl: POSTER_URLS.nosferatu,
    plot: null,
  },
  {
    id: "barbie-imax",
    title: "Barbie (IMAX)",
    year: 2023,
    genre: "Comedy · Fantasy",
    director: "Greta Gerwig",
    cast: ["Margot Robbie"],
    rating: 6.9,
    duration: "1h 54m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "52 GB",
    bitrate: "~52 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "films-4k",
    filename: "Barbie.2023.IMAX.2160p.mkv",
    matched: true,
    posterUrl: POSTER_URLS.barbie,
    plot: null,
  },
  {
    id: "civilwar-theatrical",
    title: "Civil War (Theatrical)",
    year: 2024,
    genre: "Action · Drama",
    director: "Alex Garland",
    cast: ["Kirsten Dunst"],
    rating: 7.1,
    duration: "1h 49m",
    resolution: "1080p",
    codec: "H264",
    audio: "DTS",
    audioChannels: "5.1",
    size: "13 GB",
    bitrate: "~11 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "—",
    profile: "films-1080",
    filename: "Civil.War.2024.Theatrical.1080p.mkv",
    matched: true,
    posterUrl: POSTER_URLS.civilwar,
    plot: null,
  },
  {
    id: "unmatched-rip",
    title: null,
    year: null,
    genre: null,
    director: null,
    cast: [],
    rating: null,
    duration: "1h 47m",
    resolution: "1080p",
    codec: "H264",
    audio: "AAC",
    audioChannels: "2.0",
    size: "8 GB",
    bitrate: "~9 Mbps",
    frameRate: "25 fps",
    container: "MKV",
    hdr: null,
    profile: "docs",
    filename: "XxxUnknownFilm_rip_final2.mkv",
    matched: false,
    posterUrl: null,
    plot: null,
  },
];

/* ---------- Watchlist ---------- */

export const watchlist: WatchlistItem[] = [
  {
    id: "wl-1",
    filmId: "oppenheimer",
    title: "Oppenheimer",
    year: 2023,
    genre: "Drama",
    duration: "3h 1m",
    resolution: "4K",
    addedAt: "2 days ago",
    progress: 42,
  },
  {
    id: "wl-2",
    filmId: "nosferatu",
    title: "Nosferatu",
    year: 2024,
    genre: "Horror",
    duration: "2h 12m",
    resolution: "4K",
    addedAt: "1 week ago",
  },
  {
    id: "wl-3",
    filmId: "civilwar",
    title: "Civil War",
    year: 2024,
    genre: "Action",
    duration: "1h 49m",
    resolution: "1080p",
    addedAt: "1 week ago",
  },
  {
    id: "wl-4",
    filmId: "barbie",
    title: "Barbie",
    year: 2023,
    genre: "Comedy",
    duration: "1h 54m",
    resolution: "4K",
    addedAt: "3 weeks ago",
  },
];

/* ---------- User ---------- */

export const user = {
  name: "ngareleo",
  initials: "NL",
  email: "ngareleo@example.com",
  totalProfiles: profiles.length,
  totalFiles: films.length,
  hostMode: "self-hosted" as const,
};

/* ---------- Selectors ---------- */

export function getFilmsForProfile(profileId: string): Film[] {
  return films.filter((f) => f.profile === profileId);
}

export function getFilmById(id: string): Film | undefined {
  return films.find((f) => f.id === id);
}
