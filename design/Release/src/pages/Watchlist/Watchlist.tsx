import { type FC, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  type Film,
  type WatchlistItem,
  getFilmById,
  watchlist,
} from "../../data/mock.js";
import { Poster } from "../../components/Poster/Poster.js";
import { ImdbBadge } from "../../lib/icons.js";
import { useWatchlistStyles } from "./Watchlist.styles.js";

interface Entry {
  item: WatchlistItem;
  film: Film;
}

export const Watchlist: FC = () => {
  const styles = useWatchlistStyles();

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    for (const item of watchlist) {
      const film = getFilmById(item.filmId);
      if (film !== undefined) out.push({ item, film });
    }
    return out;
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.eyebrow}>YOUR WATCHLIST</div>
        <div className={styles.title}>{entries.length} films queued.</div>
        <div className={styles.subtitle}>
          Saved across sessions. Click a poster to play.
        </div>
      </div>

      <div className={styles.grid}>
        {entries.map(({ item, film }) => (
          <Link
            key={item.id}
            to={`/?film=${film.id}`}
            className={styles.tile}
          >
            <div className={styles.tileFrame}>
              <Poster
                url={film.posterUrl}
                alt={film.title ?? film.filename}
                className={styles.tileImage}
              />
              {item.progress !== undefined && (
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {film.rating !== null && (
                <div className={styles.ratingBadge}>
                  <ImdbBadge />
                  {film.rating}
                </div>
              )}
            </div>
            <div className={styles.tileMeta}>
              <div className={styles.tileTitle}>
                {film.title ?? film.filename}
              </div>
              <div className={styles.tileSubtitle}>
                {item.year} · {item.duration} · {item.resolution}
              </div>
              <div className={styles.tileAdded}>Added {item.addedAt}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};
