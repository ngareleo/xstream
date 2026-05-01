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
  unmatched: number;
  scanning: boolean;
  scanProgress?: { done: number; total: number };
}

export interface Film {
  id: string;
  title: string | null;
  year: number | null;
  genre: string | null;
  director: string | null;
  cast: string[];
  rating: number | null;
  duration: string;
  resolution: string;
  codec: string;
  audio: string;
  audioChannels: string;
  size: string;
  bitrate: string;
  frameRate: string;
  container: string;
  hdr: string | null;
  profile: string;
  filename: string;
  matched: boolean;
  gradient: string;
  plot: string | null;
  mediaType?: "movies" | "tv";
  seasons?: number;
  episodeCount?: number;
}

export interface WatchlistItem {
  id: string;
  filmId: string;
  title: string;
  year: number;
  genre: string;
  duration: string;
  resolution: string;
  addedAt: string;
  progress?: number;
  notes?: string;
}

export const user = {
  name: "ngareleo",
  email: "ngareleo@example.com",
  avatar: "N",
  totalProfiles: 3,
  totalFiles: 463,
};

export const profiles: Profile[] = [
  {
    id: "endurance-movies",
    name: "Endurance Movies",
    path: "~/Videos/Movies",
    type: "movies",
    filmCount: 218,
    size: "1.4 TB",
    matched: 214,
    unmatched: 4,
    scanning: false,
  },
  {
    id: "tv-shows",
    name: "TV Shows",
    path: "~/Videos/Series",
    type: "tv",
    showCount: 14,
    episodeCount: 194,
    size: "820 GB",
    matched: 14,
    unmatched: 0,
    scanning: false,
  },
  {
    id: "4k-vault",
    name: "4K Vault",
    path: "/mnt/nas/4K",
    type: "movies",
    filmCount: 31,
    size: "2.1 TB",
    matched: 28,
    unmatched: 3,
    scanning: true,
    scanProgress: { done: 31, total: 45 },
  },
];

export const films: Film[] = [
  {
    id: "dune-2",
    title: "Dune: Part Two",
    year: 2024,
    genre: "Sci-Fi",
    director: "Denis Villeneuve",
    cast: ["Timothée Chalamet", "Zendaya", "Rebecca Ferguson", "Austin Butler"],
    rating: 8.8,
    duration: "2h 46m",
    resolution: "4K",
    codec: "H.265",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "58 GB",
    bitrate: "~56 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "endurance-movies",
    filename: "Dune.Part.Two.2024.2160p.HDR.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #0d1b2a, #1b2838)",
    plot: "Paul Atreides unites with the Fremen while on a path of revenge against the conspirators who destroyed his family. Facing a choice between the love of his life and the fate of the known universe, he endeavors to prevent a terrible future.",
  },
  {
    id: "parasite",
    title: "Parasite",
    year: 2019,
    genre: "Thriller",
    director: "Bong Joon-ho",
    cast: ["Song Kang-ho", "Lee Sun-kyun", "Cho Yeo-jeong", "Choi Woo-shik"],
    rating: 8.5,
    duration: "2h 12m",
    resolution: "1080p",
    codec: "H.264",
    audio: "DTS",
    audioChannels: "5.1",
    size: "12 GB",
    bitrate: "~12 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: null,
    profile: "endurance-movies",
    filename: "Parasite.2019.Korean.1080p.BluRay.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #1a0a0a, #2d1515)",
    plot: "Greed and class discrimination threaten the newly formed symbiotic relationship between the wealthy Park family and the destitute Kim clan.",
  },
  {
    id: "mad-max",
    title: "Mad Max: Fury Road",
    year: 2015,
    genre: "Action",
    director: "George Miller",
    cast: ["Tom Hardy", "Charlize Theron", "Nicholas Hoult"],
    rating: 8.1,
    duration: "2h",
    resolution: "4K",
    codec: "H.265",
    audio: "DTS-HD",
    audioChannels: "5.1",
    size: "42 GB",
    bitrate: "~48 Mbps",
    frameRate: "24 fps",
    container: "MKV",
    hdr: null,
    profile: "endurance-movies",
    filename: "Mad.Max.Fury.Road.2015.2160p.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #1a0800, #2d1500)",
    plot: "In a post-apocalyptic wasteland, a woman rebels against a tyrannical ruler in search of her homeland with the aid of a group of female prisoners, a psychotic worshiper, and a drifter named Max.",
  },
  {
    id: "baraka",
    title: "Baraka",
    year: 1992,
    genre: "Documentary",
    director: "Ron Fricke",
    cast: [],
    rating: 8.5,
    duration: "1h 36m",
    resolution: "4K",
    codec: "H.265",
    audio: "DTS",
    audioChannels: "5.1",
    size: "38 GB",
    bitrate: "~45 Mbps",
    frameRate: "24 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "endurance-movies",
    filename: "Baraka.1992.4K.Remastered.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #0a1a0a, #1a2d1a)",
    plot: "A non-narrative film shot in 24 countries on six continents. Baraka presents a collection of scenes of human life and religion, nature, and the cosmos.",
  },
  {
    id: "shining",
    title: "The Shining",
    year: 1980,
    genre: "Horror",
    director: "Stanley Kubrick",
    cast: ["Jack Nicholson", "Shelley Duvall", "Danny Lloyd"],
    rating: 8.4,
    duration: "2h 26m",
    resolution: "1080p",
    codec: "H.264",
    audio: "AAC",
    audioChannels: "2.0",
    size: "14 GB",
    bitrate: "~13 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: null,
    profile: "endurance-movies",
    filename: "The.Shining.1980.1080p.BluRay.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #0a0a0a, #1a1a1a)",
    plot: "A family heads to an isolated hotel for the winter where a sinister presence influences the father into violence, while his psychic son sees horrific forebodings from both past and future.",
  },
  {
    id: "arrival",
    title: "Arrival",
    year: 2016,
    genre: "Sci-Fi",
    director: "Denis Villeneuve",
    cast: ["Amy Adams", "Jeremy Renner", "Forest Whitaker"],
    rating: 7.9,
    duration: "1h 56m",
    resolution: "1080p",
    codec: "H.264",
    audio: "DTS",
    audioChannels: "5.1",
    size: "10 GB",
    bitrate: "~12 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: null,
    profile: "endurance-movies",
    filename: "Arrival.2016.1080p.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #050e1a, #0d1f2d)",
    plot: "A linguist works with the military to communicate with alien lifeforms after twelve mysterious spacecraft appear around the world.",
  },
  {
    id: "unknown-rip",
    title: null,
    year: null,
    genre: null,
    director: null,
    cast: [],
    rating: null,
    duration: "1h 52m",
    resolution: "1080p",
    codec: "H.264",
    audio: "AAC",
    audioChannels: "2.0",
    size: "8 GB",
    bitrate: "~9 Mbps",
    frameRate: "25 fps",
    container: "MKV",
    hdr: null,
    profile: "endurance-movies",
    filename: "XxxUnknownFilm_rip_final2.mkv",
    matched: false,
    gradient: "linear-gradient(160deg, #111, #222)",
    plot: null,
  },
  {
    id: "interstellar",
    title: "Interstellar",
    year: 2014,
    genre: "Sci-Fi",
    director: "Christopher Nolan",
    cast: ["Matthew McConaughey", "Anne Hathaway", "Jessica Chastain", "Michael Caine"],
    rating: 8.7,
    duration: "2h 49m",
    resolution: "4K",
    codec: "H.265",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "52 GB",
    bitrate: "~54 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "4k-vault",
    filename: "Interstellar.2014.2160p.HDR.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #050a14, #0a1428)",
    plot: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
  },
  {
    id: "oppenheimer",
    title: "Oppenheimer",
    year: 2023,
    genre: "Drama",
    director: "Christopher Nolan",
    cast: ["Cillian Murphy", "Emily Blunt", "Matt Damon", "Robert Downey Jr."],
    rating: 8.3,
    duration: "3h",
    resolution: "4K",
    codec: "H.265",
    audio: "Dolby Atmos",
    audioChannels: "7.1",
    size: "62 GB",
    bitrate: "~60 Mbps",
    frameRate: "23.976 fps",
    container: "MKV",
    hdr: "Dolby Vision",
    profile: "4k-vault",
    filename: "Oppenheimer.2023.2160p.IMAX.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #1a0f00, #2d1a00)",
    plot: "The story of American scientist J. Robert Oppenheimer and his role in the development of the atomic bomb during World War II.",
  },
  {
    id: "blade-runner",
    title: "Blade Runner 2049",
    year: 2017,
    genre: "Sci-Fi",
    director: "Denis Villeneuve",
    cast: ["Ryan Gosling", "Harrison Ford", "Ana de Armas"],
    rating: 8.0,
    duration: "2h 44m",
    resolution: "4K",
    codec: "H.265",
    audio: "DTS-HD",
    audioChannels: "5.1",
    size: "44 GB",
    bitrate: "~50 Mbps",
    frameRate: "24 fps",
    container: "MKV",
    hdr: "HDR10",
    profile: "4k-vault",
    filename: "Blade.Runner.2049.2017.2160p.mkv",
    matched: true,
    gradient: "linear-gradient(160deg, #0a0a1f, #12122e)",
    plot: "Young Blade Runner K's discovery of a long-buried secret leads him to track down former Blade Runner Rick Deckard, who's been missing for thirty years.",
  },
];

export const watchlist: WatchlistItem[] = [
  { id: "wl-1", filmId: "dune-2", title: "Dune: Part Two", year: 2024, genre: "Sci-Fi", duration: "2h 46m", resolution: "4K", addedAt: "2 days ago", progress: 42 },
  { id: "wl-2", filmId: "oppenheimer", title: "Oppenheimer", year: 2023, genre: "Drama", duration: "3h", resolution: "4K", addedAt: "1 week ago" },
  { id: "wl-3", filmId: "blade-runner", title: "Blade Runner 2049", year: 2017, genre: "Sci-Fi", duration: "2h 44m", resolution: "4K", addedAt: "1 week ago" },
  { id: "wl-4", filmId: "arrival", title: "Arrival", year: 2016, genre: "Sci-Fi", duration: "1h 56m", resolution: "1080p", addedAt: "2 weeks ago", notes: "Re-watch with subtitles" },
  { id: "wl-5", filmId: "baraka", title: "Baraka", year: 1992, genre: "Documentary", duration: "1h 36m", resolution: "4K", addedAt: "3 weeks ago" },
  { id: "wl-6", filmId: "interstellar", title: "Interstellar", year: 2014, genre: "Sci-Fi", duration: "2h 49m", resolution: "4K", addedAt: "1 month ago" },
];

export function getFilmsForProfile(profileId: string): Film[] {
  return films.filter((f) => f.profile === profileId);
}

export function getFilmById(id: string): Film | undefined {
  return films.find((f) => f.id === id);
}
