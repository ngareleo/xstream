/**
 * Offline mock for OMDb's `s=` (search) endpoint. Mirrors the shape
 * the production server consumes (`server/src/services/omdbService.ts`)
 * so a future port can swap this fixture for a real fetch without
 * changing the picker UI.
 *
 * The catalog mixes our installed films (so a re-link shows the
 * already-correct match high in the results) with a few neighbouring
 * canonical titles for variety.
 */

export interface OmdbResult {
  imdbId: string;
  title: string;
  year: number;
  type: "movie" | "series";
  posterUrl: string | null;
  genre: string;
  director: string;
  runtime: string;
  plot: string;
}

const CATALOG: OmdbResult[] = [
  {
    imdbId: "tt15398776",
    title: "Oppenheimer",
    year: 2023,
    type: "movie",
    posterUrl: "/posters/oppenheimer.jpg",
    genre: "Biography · Drama · History",
    director: "Christopher Nolan",
    runtime: "180 min",
    plot: "A dramatization of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
  },
  {
    imdbId: "tt5537002",
    title: "Nosferatu",
    year: 2024,
    type: "movie",
    posterUrl: "/posters/nosferatu.jpg",
    genre: "Drama · Fantasy · Horror",
    director: "Robert Eggers",
    runtime: "132 min",
    plot: "A gothic tale of obsession between a haunted young woman and the terrifying vampire infatuated with her.",
  },
  {
    imdbId: "tt1517268",
    title: "Barbie",
    year: 2023,
    type: "movie",
    posterUrl: "/posters/barbie.jpg",
    genre: "Adventure · Comedy · Fantasy",
    director: "Greta Gerwig",
    runtime: "114 min",
    plot: "Barbie suffers a crisis that leads her to question her world and her existence.",
  },
  {
    imdbId: "tt17279496",
    title: "Civil War",
    year: 2024,
    type: "movie",
    posterUrl: "/posters/civilwar.jpg",
    genre: "Action · Drama · Thriller",
    director: "Alex Garland",
    runtime: "109 min",
    plot: "A journey across a dystopian future America, following a team of military-embedded journalists.",
  },
  {
    imdbId: "tt12037194",
    title: "Furiosa: A Mad Max Saga",
    year: 2024,
    type: "movie",
    posterUrl: "/posters/furiosa.jpg",
    genre: "Action · Adventure · Sci-Fi",
    director: "George Miller",
    runtime: "148 min",
    plot: "The origin story of renegade warrior Furiosa before her encounter and team-up with Mad Max.",
  },
  {
    imdbId: "tt1392190",
    title: "Mad Max: Fury Road",
    year: 2015,
    type: "movie",
    posterUrl: "/posters/madmax.jpg",
    genre: "Action · Adventure · Sci-Fi",
    director: "George Miller",
    runtime: "120 min",
    plot: "In a post-apocalyptic wasteland, Max teams up with a mysterious woman to flee a tyrant.",
  },
  {
    imdbId: "tt16311594",
    title: "F1",
    year: 2025,
    type: "movie",
    posterUrl: "/posters/f1.jpg",
    genre: "Action · Drama · Sport",
    director: "Joseph Kosinski",
    runtime: "155 min",
    plot: "A Formula 1 driver who came out of retirement to mentor and team up with a younger driver.",
  },
  {
    imdbId: "tt5950044",
    title: "Superman",
    year: 2025,
    type: "movie",
    posterUrl: "/posters/superman.jpg",
    genre: "Action · Adventure · Sci-Fi",
    director: "James Gunn",
    runtime: "129 min",
    plot: "Superman, a journalist in Metropolis, embarks on a journey to reconcile his Kryptonian heritage with his human upbringing as Clark Kent.",
  },
  {
    imdbId: "tt12361974",
    title: "Zack Snyder's Justice League",
    year: 2021,
    type: "movie",
    posterUrl: "/posters/justiceleague.jpg",
    genre: "Action · Adventure · Fantasy",
    director: "Zack Snyder",
    runtime: "242 min",
    plot: "Determined to ensure Superman's ultimate sacrifice was not in vain, Bruce Wayne aligns forces with Diana Prince.",
  },
  // Catalog-only candidates — used as "near matches" while typing.
  {
    imdbId: "tt0468569",
    title: "The Dark Knight",
    year: 2008,
    type: "movie",
    posterUrl: null,
    genre: "Action · Crime · Drama",
    director: "Christopher Nolan",
    runtime: "152 min",
    plot: "When the menace known as the Joker wreaks havoc on Gotham, Batman must accept one of the greatest psychological tests of his ability to fight injustice.",
  },
  {
    imdbId: "tt0816692",
    title: "Interstellar",
    year: 2014,
    type: "movie",
    posterUrl: null,
    genre: "Adventure · Drama · Sci-Fi",
    director: "Christopher Nolan",
    runtime: "169 min",
    plot: "A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.",
  },
  {
    imdbId: "tt5013056",
    title: "Dunkirk",
    year: 2017,
    type: "movie",
    posterUrl: null,
    genre: "Action · Drama · History",
    director: "Christopher Nolan",
    runtime: "106 min",
    plot: "Allied soldiers from Belgium, the British Commonwealth and Empire, and France are surrounded by the German Army and evacuated during a fierce battle in World War II.",
  },
  {
    imdbId: "tt1375666",
    title: "Inception",
    year: 2010,
    type: "movie",
    posterUrl: null,
    genre: "Action · Adventure · Sci-Fi",
    director: "Christopher Nolan",
    runtime: "148 min",
    plot: "A thief who steals corporate secrets through the use of dream-sharing technology is given the inverse task of planting an idea into the mind of a C.E.O.",
  },
  {
    imdbId: "tt6723592",
    title: "Tenet",
    year: 2020,
    type: "movie",
    posterUrl: null,
    genre: "Action · Sci-Fi · Thriller",
    director: "Christopher Nolan",
    runtime: "150 min",
    plot: "Armed with only one word—Tenet—and fighting for the survival of the entire world, the Protagonist journeys through a twilight world of international espionage.",
  },
];

/**
 * Returns up to `limit` results matching the query. Match priority:
 *   1. Exact IMDb-id prefix
 *   2. Title prefix
 *   3. Title contains
 *   4. Director contains
 * No network — purely synchronous so the picker can render in one tick.
 */
export function searchOmdb(query: string, limit = 8): OmdbResult[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const scored: { result: OmdbResult; score: number }[] = [];
  for (const result of CATALOG) {
    const title = result.title.toLowerCase();
    const director = result.director.toLowerCase();
    const imdbId = result.imdbId.toLowerCase();

    let score = 0;
    if (imdbId.startsWith(q)) score = 100;
    else if (title.startsWith(q)) score = 80;
    else if (title.includes(q)) score = 60;
    else if (director.includes(q)) score = 40;
    if (score > 0) scored.push({ result, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((s) => s.result);
}
