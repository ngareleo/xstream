/**
 * Mock data for the Xstream design lab.
 * Seeded from `/home/dag/Downloads/app-mockups.jsx` POSTERS (Oppenheimer,
 * Barbie, Nosferatu, Civil War) and expanded to populate the library grid +
 * multiple profiles. Poster JPGs are pulled from OMDb via
 * `scripts/fetch-posters.ts` and served from `/posters/<id>.jpg` so the lab
 * stays offline-safe.
 *
 * Mirrors the Profile / Film / WatchlistItem shapes used by the Prerelease
 * lab so future refactors that share types stay trivial.
 *
 * TV shows are modelled as `Film` records with `kind: "series"` and a
 * populated `seasons` array. Per-episode availability lives on
 * `Episode.available` so the UI can render "12 of 22 on disk" summaries.
 */

export interface Episode {
  number: number;
  title: string;
  duration: string;
  available: boolean;
  resolution?: "4K" | "1080p" | "720p";
  /** True if the user has watched this episode end-to-end. */
  watched?: boolean;
  /** 0–100. Set when the user paused mid-episode. Mutually exclusive
   *  with `watched=true` — a finished episode has progress reset. */
  progress?: number;
}

export interface Season {
  number: number;
  episodes: Episode[];
}

export type MediaKind = "movie" | "series";

export interface Film {
  id: string;
  /** Discriminator for movie vs TV-show entries. Series carry `seasons`. */
  kind: MediaKind;
  title: string | null;
  year: number | null;
  genre: string | null;
  /** For series, holds the show's creator(s). */
  director: string | null;
  cast: string[];
  rating: number | null;
  /** Movie runtime, or representative "~55m / ep" for series. */
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
  /** Populated only when `kind === "series"`. */
  seasons?: Season[];
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
  oppenheimer: "/posters/oppenheimer.jpg",
  barbie: "/posters/barbie.jpg",
  nosferatu: "/posters/nosferatu.jpg",
  civilwar: "/posters/civilwar.jpg",
  furiosa: "/posters/furiosa.jpg",
  madmax: "/posters/madmax.jpg",
  f1: "/posters/f1.jpg",
  superman: "/posters/superman.jpg",
  justiceleague: "/posters/justiceleague.jpg",
  got: "/posters/got.jpg",
  insecure: "/posters/insecure.jpg",
  theoffice: "/posters/theoffice.jpg",
  community: "/posters/community.jpg",
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
    name: "TV / Series",
    path: "/media/tv",
    type: "tv",
    showCount: 4,
    episodeCount: 173,
    size: "640 GB",
    matched: 4,
    total: 4,
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

/**
 * Helper: build a season with `total` episodes where the first
 * `availableUpTo` are on disk and the rest are flagged missing.
 * Episode titles default to "Episode N" — overridden via `titles`
 * for shows where the names are part of the recognisable surface.
 */
function makeSeason(
  number: number,
  total: number,
  availableUpTo: number,
  resolution: "4K" | "1080p" | "720p",
  durationPerEp: string,
  titles?: string[],
): Season {
  return {
    number,
    episodes: Array.from({ length: total }, (_, i) => {
      const epNumber = i + 1;
      const available = epNumber <= availableUpTo;
      const title =
        titles && i < titles.length ? titles[i] : `Episode ${epNumber}`;
      return {
        number: epNumber,
        title,
        duration: durationPerEp,
        available,
        ...(available ? { resolution } : {}),
      };
    }),
  };
}

/**
 * Mutate a season in-place to mark a contiguous run of episodes as
 * watched and (optionally) the next one as in-progress. Used to seed
 * realistic resume positions on the test shows. The fields are
 * mutually exclusive — a watched episode has no `progress`.
 */
function markWatched(
  season: Season,
  watchedThrough: number,
  inProgress?: { episode: number; percent: number },
): Season {
  for (const ep of season.episodes) {
    if (ep.number <= watchedThrough) ep.watched = true;
  }
  if (inProgress) {
    const ep = season.episodes.find((e) => e.number === inProgress.episode);
    if (ep && !ep.watched) ep.progress = inProgress.percent;
  }
  return season;
}

export const films: Film[] = [
  {
    id: "oppenheimer",
    kind: "movie",
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
    kind: "movie",
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
    kind: "movie",
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
    kind: "movie",
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
  {
    id: "furiosa",
    kind: "movie",
    title: "Furiosa: A Mad Max Saga",
    year: 2024,
    genre: "Action · Adventure",
    director: "George Miller",
    cast: ["Anya Taylor-Joy", "Chris Hemsworth", "Tom Burke"],
    rating: 7.5,
    duration: "2h 28m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "58 GB",
    bitrate: "~56 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "DV",
    profile: "films-4k",
    filename: "Furiosa.A.Mad.Max.Saga.2024.2160p.UHD.BluRay.HEVC.mkv",
    matched: true,
    posterUrl: POSTER_URLS.furiosa,
    plot: "The origin story of renegade warrior Furiosa before her encounter and team-up with Mad Max.",
  },
  {
    id: "madmax",
    kind: "movie",
    title: "Mad Max: Fury Road",
    year: 2015,
    genre: "Action · Adventure",
    director: "George Miller",
    cast: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"],
    rating: 8.1,
    duration: "2h 0m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "54 GB",
    bitrate: "~52 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "films-4k",
    filename: "Mad.Max.Fury.Road.2015.2160p.UHD.BluRay.HEVC.mkv",
    matched: true,
    posterUrl: POSTER_URLS.madmax,
    plot: "In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search for her homeland with the aid of a group of female prisoners, a psychotic worshipper, and a drifter named Max.",
  },
  {
    id: "f1",
    kind: "movie",
    title: "F1",
    year: 2025,
    genre: "Action · Drama · Sport",
    director: "Joseph Kosinski",
    cast: ["Brad Pitt", "Damson Idris", "Kerry Condon", "Javier Bardem"],
    rating: 7.8,
    duration: "2h 35m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "68 GB",
    bitrate: "~62 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "DV",
    profile: "films-4k",
    filename: "F1.2025.2160p.UHD.BluRay.HEVC.mkv",
    matched: true,
    posterUrl: POSTER_URLS.f1,
    plot: "A Formula 1 driver who came out of retirement to mentor and team up with a younger driver.",
  },
  {
    id: "superman",
    kind: "movie",
    title: "Superman",
    year: 2025,
    genre: "Action · Adventure · Superhero",
    director: "James Gunn",
    cast: ["David Corenswet", "Rachel Brosnahan", "Nicholas Hoult"],
    rating: 7.4,
    duration: "2h 9m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "52 GB",
    bitrate: "~50 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "DV",
    profile: "films-4k",
    filename: "Superman.2025.2160p.UHD.BluRay.HEVC.mkv",
    matched: true,
    posterUrl: POSTER_URLS.superman,
    plot: "Superman, a journalist in Metropolis, embarks on a journey to reconcile his Kryptonian heritage with his human upbringing as Clark Kent.",
  },
  {
    id: "justiceleague",
    kind: "movie",
    title: "Zack Snyder's Justice League",
    year: 2021,
    genre: "Action · Adventure · Superhero",
    director: "Zack Snyder",
    cast: ["Ben Affleck", "Henry Cavill", "Gal Gadot", "Ray Fisher", "Ezra Miller", "Jason Momoa"],
    rating: 8.0,
    duration: "4h 2m",
    resolution: "4K",
    codec: "HEVC",
    audio: "Dolby Atmos",
    audioChannels: "5.1",
    size: "92 GB",
    bitrate: "~58 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "films-4k",
    filename: "Zack.Snyders.Justice.League.2021.2160p.UHD.HEVC.mkv",
    matched: true,
    posterUrl: POSTER_URLS.justiceleague,
    plot: "Determined to ensure Superman's ultimate sacrifice was not in vain, Bruce Wayne aligns forces with Diana Prince with plans to recruit a team of metahumans to protect the world from an approaching threat of catastrophic proportions.",
  },
  /* ---------- Synthetic entries to populate the library grid ---------- */
  {
    id: "oppenheimer-cut",
    kind: "movie",
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
    kind: "movie",
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
    kind: "movie",
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
    kind: "movie",
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
    kind: "movie",
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
  /* ---------- TV shows (kind: "series") ---------- */
  {
    id: "got",
    kind: "series",
    title: "Game of Thrones",
    year: 2011,
    genre: "Drama · Fantasy · Adventure",
    director: "David Benioff & D.B. Weiss",
    cast: [
      "Emilia Clarke",
      "Peter Dinklage",
      "Kit Harington",
      "Lena Headey",
      "Sophie Turner",
    ],
    rating: 9.2,
    duration: "~57m / ep",
    resolution: "4K",
    codec: "HEVC",
    audio: "DTS-HD MA",
    audioChannels: "5.1",
    size: "412 GB",
    bitrate: "~38 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "tv",
    filename: "Game.of.Thrones/",
    matched: true,
    posterUrl: POSTER_URLS.got,
    plot: "Nine noble families fight for control over the lands of Westeros, while an ancient enemy returns after being dormant for millennia.",
    seasons: [
      markWatched(
        makeSeason(1, 10, 10, "4K", "55m", [
          "Winter Is Coming",
          "The Kingsroad",
          "Lord Snow",
          "Cripples, Bastards, and Broken Things",
          "The Wolf and the Lion",
          "A Golden Crown",
          "You Win or You Die",
          "The Pointy End",
          "Baelor",
          "Fire and Blood",
        ]),
        4, // watched S01E01–E04
        { episode: 5, percent: 38 }, // resuming "The Wolf and the Lion"
      ),
      makeSeason(2, 10, 10, "4K", "55m", [
        "The North Remembers",
        "The Night Lands",
        "What Is Dead May Never Die",
        "Garden of Bones",
        "The Ghost of Harrenhal",
        "The Old Gods and the New",
        "A Man Without Honor",
        "The Prince of Winterfell",
        "Blackwater",
        "Valar Morghulis",
      ]),
      makeSeason(3, 10, 10, "4K", "57m"),
      makeSeason(4, 10, 10, "4K", "57m"),
      makeSeason(5, 10, 10, "4K", "57m"),
      makeSeason(6, 10, 10, "4K", "59m"),
      makeSeason(7, 7, 4, "4K", "62m"),
      makeSeason(8, 6, 0, "4K", "65m"),
    ],
  },
  {
    id: "insecure",
    kind: "series",
    title: "Insecure",
    year: 2016,
    genre: "Comedy · Drama",
    director: "Issa Rae & Larry Wilmore",
    cast: ["Issa Rae", "Yvonne Orji", "Jay Ellis", "Natasha Rothwell"],
    rating: 8.0,
    duration: "~30m / ep",
    resolution: "1080p",
    codec: "H264",
    audio: "AAC",
    audioChannels: "5.1",
    size: "48 GB",
    bitrate: "~12 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "—",
    profile: "tv",
    filename: "Insecure/",
    matched: true,
    posterUrl: POSTER_URLS.insecure,
    plot: "Best friends Issa and Molly navigate the complex experiences of being modern-day Black women in Los Angeles.",
    seasons: [
      markWatched(
        makeSeason(1, 8, 8, "1080p", "30m", [
          "Insecure as F**k",
          "Messy as F**k",
          "Racist as F**k",
          "Thirsty as F**k",
          "Shady as F**k",
          "Guilty as F**k",
          "Real as F**k",
          "Broken as F**k",
        ]),
        2, // watched S01E01–E02
        { episode: 3, percent: 64 }, // resuming "Racist as F**k"
      ),
      makeSeason(2, 8, 8, "1080p", "30m"),
      makeSeason(3, 8, 8, "1080p", "30m"),
      makeSeason(4, 10, 10, "1080p", "30m"),
      makeSeason(5, 10, 10, "1080p", "32m"),
    ],
  },
  {
    id: "theoffice",
    kind: "series",
    title: "The Office",
    year: 2005,
    genre: "Comedy · Mockumentary",
    director: "Greg Daniels (developer)",
    cast: [
      "Steve Carell",
      "Rainn Wilson",
      "John Krasinski",
      "Jenna Fischer",
      "B.J. Novak",
    ],
    rating: 9.0,
    duration: "~22m / ep",
    resolution: "1080p",
    codec: "H264",
    audio: "AC3",
    audioChannels: "5.1",
    size: "118 GB",
    bitrate: "~10 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "—",
    profile: "tv",
    filename: "The.Office.US/",
    matched: true,
    posterUrl: POSTER_URLS.theoffice,
    plot: "A mockumentary on a group of typical office workers, where the workday consists of ego clashes, inappropriate behavior, and tedium.",
    seasons: [
      makeSeason(1, 6, 6, "1080p", "22m", [
        "Pilot",
        "Diversity Day",
        "Health Care",
        "The Alliance",
        "Basketball",
        "Hot Girl",
      ]),
      makeSeason(2, 22, 22, "1080p", "22m"),
      makeSeason(3, 25, 25, "1080p", "22m"),
      makeSeason(4, 19, 19, "1080p", "28m"),
      makeSeason(5, 28, 28, "1080p", "22m"),
      makeSeason(6, 26, 14, "1080p", "22m"),
      makeSeason(7, 26, 0, "1080p", "22m"),
      makeSeason(8, 24, 0, "1080p", "22m"),
      makeSeason(9, 25, 0, "1080p", "22m"),
    ],
  },
  {
    id: "community",
    kind: "series",
    title: "Community",
    year: 2009,
    genre: "Comedy",
    director: "Dan Harmon",
    cast: [
      "Joel McHale",
      "Donald Glover",
      "Alison Brie",
      "Danny Pudi",
      "Gillian Jacobs",
    ],
    rating: 8.5,
    duration: "~22m / ep",
    resolution: "1080p",
    codec: "H264",
    audio: "AC3",
    audioChannels: "5.1",
    size: "62 GB",
    bitrate: "~10 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "—",
    profile: "tv",
    filename: "Community/",
    matched: true,
    posterUrl: POSTER_URLS.community,
    plot: "A suspended lawyer is forced to enrol in a community college with an eclectic study group of misfits.",
    seasons: [
      makeSeason(1, 25, 25, "1080p", "22m", [
        "Pilot",
        "Spanish 101",
        "Introduction to Film",
        "Social Psychology",
        "Advanced Criminal Law",
        "Football, Feminism and You",
        "Introduction to Statistics",
        "Home Economics",
        "Debate 109",
        "Environmental Science",
        "The Politics of Human Sexuality",
        "Comparative Religion",
        "Investigative Journalism",
        "Interpretive Dance",
        "Romantic Expressionism",
        "Communication Studies",
        "Physical Education",
        "Basic Genealogy",
        "Beginner Pottery",
        "The Science of Illusion",
        "Contemporary American Poultry",
        "The Art of Discourse",
        "Modern Warfare",
        "English as a Second Language",
        "Pascal's Triangle Revisited",
      ]),
      makeSeason(2, 24, 24, "1080p", "22m"),
      makeSeason(3, 22, 22, "1080p", "22m"),
      makeSeason(4, 13, 5, "1080p", "22m"),
      makeSeason(5, 13, 0, "1080p", "22m"),
      makeSeason(6, 13, 0, "1080p", "22m"),
    ],
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
    progress: 73,
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
    progress: 18,
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
  {
    id: "wl-5",
    filmId: "furiosa",
    title: "Furiosa: A Mad Max Saga",
    year: 2024,
    genre: "Action",
    duration: "2h 28m",
    resolution: "4K",
    addedAt: "5 days ago",
    progress: 64,
  },
  {
    id: "wl-6",
    filmId: "madmax",
    title: "Mad Max: Fury Road",
    year: 2015,
    genre: "Action",
    duration: "2h 0m",
    resolution: "4K",
    addedAt: "2 weeks ago",
    progress: 91,
  },
  {
    id: "wl-7",
    filmId: "f1",
    title: "F1",
    year: 2025,
    genre: "Sport",
    duration: "2h 35m",
    resolution: "4K",
    addedAt: "Yesterday",
    progress: 8,
  },
  {
    id: "wl-8",
    filmId: "superman",
    title: "Superman",
    year: 2025,
    genre: "Superhero",
    duration: "2h 9m",
    resolution: "4K",
    addedAt: "4 days ago",
    progress: 36,
  },
  {
    id: "wl-9",
    filmId: "justiceleague",
    title: "Zack Snyder's Justice League",
    year: 2021,
    genre: "Superhero",
    duration: "4h 2m",
    resolution: "4K",
    addedAt: "1 month ago",
    progress: 22,
  },
  {
    id: "wl-10",
    filmId: "oppenheimer-cut",
    title: "Oppenheimer (Director's Cut)",
    year: 2023,
    genre: "Drama",
    duration: "3h 24m",
    resolution: "4K",
    addedAt: "Yesterday",
    progress: 55,
  },
  {
    id: "wl-11",
    filmId: "nosferatu-bw",
    title: "Nosferatu (B&W Print)",
    year: 2024,
    genre: "Horror",
    duration: "2h 12m",
    resolution: "4K",
    addedAt: "3 days ago",
    progress: 81,
  },
  {
    id: "wl-12",
    filmId: "barbie-imax",
    title: "Barbie (IMAX)",
    year: 2023,
    genre: "Comedy",
    duration: "1h 54m",
    resolution: "4K",
    addedAt: "6 days ago",
    progress: 12,
  },
  {
    id: "wl-13",
    filmId: "civilwar-theatrical",
    title: "Civil War (Theatrical)",
    year: 2024,
    genre: "Action",
    duration: "1h 49m",
    resolution: "1080p",
    addedAt: "2 days ago",
    progress: 47,
  },
  {
    id: "wl-14",
    filmId: "got",
    title: "Game of Thrones",
    year: 2011,
    genre: "Drama",
    duration: "S07E04",
    resolution: "4K",
    addedAt: "1 week ago",
    progress: 76,
  },
  {
    id: "wl-15",
    filmId: "theoffice",
    title: "The Office",
    year: 2005,
    genre: "Comedy",
    duration: "S06E14",
    resolution: "1080p",
    addedAt: "3 days ago",
    progress: 38,
  },
];

/* ---------- Curated home-page collections ---------- */

/**
 * IDs surfaced in the "New releases" row on the home page. Order is
 * preserved as-is when rendered.
 */
export const newReleaseIds: readonly string[] = [
  "f1",
  "superman",
  "furiosa",
  "got",
  "justiceleague",
  "madmax",
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

/**
 * For a series the user has started, returns the episode they should
 * resume on next. Priority:
 *   1. An in-progress episode (any episode with 0 < progress < 100).
 *   2. The first available, unwatched episode after the last watched one.
 *   3. `null` — they haven't started yet, or they've finished everything.
 *
 * Returns `null` for movies. Used to swap the "Play" CTA for "Continue"
 * on detail surfaces and to deep-link the player at the right episode.
 */
export function getResumeEpisode(
  film: Film,
): { season: number; episode: number; partial: boolean } | null {
  if (film.kind !== "series" || !film.seasons) return null;

  for (const s of film.seasons) {
    for (const e of s.episodes) {
      if (
        e.available &&
        !e.watched &&
        typeof e.progress === "number" &&
        e.progress > 0 &&
        e.progress < 100
      ) {
        return { season: s.number, episode: e.number, partial: true };
      }
    }
  }

  let sawWatched = false;
  for (const s of film.seasons) {
    for (const e of s.episodes) {
      if (e.watched) {
        sawWatched = true;
        continue;
      }
      if (sawWatched && e.available) {
        return { season: s.number, episode: e.number, partial: false };
      }
    }
  }

  return null;
}

/**
 * For a series, returns `{ available, total }` where `available` is the
 * count of episodes on disk and `total` is the count across every
 * scheduled season. Returns `null` for movies.
 */
export function getEpisodeStats(
  film: Film,
): { available: number; total: number } | null {
  if (film.kind !== "series" || !film.seasons) return null;
  let available = 0;
  let total = 0;
  for (const s of film.seasons) {
    for (const e of s.episodes) {
      total += 1;
      if (e.available) available += 1;
    }
  }
  return { available, total };
}
