import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { graphql, useFragment, useMutation } from "react-relay";
import { Link } from "react-router-dom";

import type { WatchlistContent_watchlistItem$key } from "~/relay/__generated__/WatchlistContent_watchlistItem.graphql.js";
import type { WatchlistContentRemoveMutation } from "~/relay/__generated__/WatchlistContentRemoveMutation.graphql.js";

import { strings } from "./WatchlistContent.strings.js";
import { useWatchlistContentStyles } from "./WatchlistContent.styles.js";

const FRAGMENT = graphql`
  fragment WatchlistContent_watchlistItem on WatchlistItem @relay(plural: true) {
    id
    progressSeconds
    addedAt
    video {
      id
      title
      durationSeconds
      metadata {
        year
        genre
        rating
        posterUrl
      }
    }
  }
`;

const REMOVE_MUTATION = graphql`
  mutation WatchlistContentRemoveMutation($id: ID!) {
    removeFromWatchlist(id: $id)
  }
`;

interface Props {
  watchlist: WatchlistContent_watchlistItem$key;
}

export const WatchlistContent: FC<Props> = ({ watchlist }) => {
  const items = useFragment(FRAGMENT, watchlist);
  const styles = useWatchlistContentStyles();
  const [removeItem] = useMutation<WatchlistContentRemoveMutation>(REMOVE_MUTATION);

  const queued = items.filter((i) => i.progressSeconds === 0).length;
  const inProgress = items.filter(
    (i) => i.progressSeconds > 0 && i.progressSeconds < i.video.durationSeconds - 30
  ).length;
  const watched = items.filter((i) => i.progressSeconds >= i.video.durationSeconds - 30).length;

  const continuing = items.filter((i) => i.progressSeconds > 0);

  const handleRemove = (id: string): void => {
    removeItem({ variables: { id } });
  };

  if (items.length === 0) {
    return (
      <div className={mergeClasses(styles.root)}>
        <div className={styles.empty}>
          <div className={styles.emptyTitle}>{strings.emptyTitle}</div>
          <div className={styles.emptyBody}>
            Browse your{" "}
            <Link to="/library" className={styles.emptyLink}>
              {strings.emptyLibraryLink}
            </Link>{" "}
            and add titles to keep track of what you want to watch.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* Stats row */}
      <div className={styles.statsRow}>
        <div className={styles.statItem}>
          <span className={styles.statNum}>{queued}</span>
          <span className={styles.statLabel}>{strings.statsQueued}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNum}>{inProgress}</span>
          <span className={styles.statLabel}>{strings.statsInProgress}</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statNum}>{watched}</span>
          <span className={styles.statLabel}>{strings.statsWatched}</span>
        </div>
      </div>

      <div className={styles.body}>
        {/* Continue Watching rail */}
        {continuing.length > 0 && (
          <>
            <div className={styles.sectionTitle}>{strings.continueWatching}</div>
            <div className={styles.rail}>
              {continuing.map((item) => {
                const pct =
                  item.video.durationSeconds > 0
                    ? (item.progressSeconds / item.video.durationSeconds) * 100
                    : 0;
                const thumbStyle = item.video.metadata?.posterUrl
                  ? { backgroundImage: `url(${item.video.metadata.posterUrl})` }
                  : undefined;
                return (
                  <Link
                    key={item.id}
                    to={`/player/${item.video.id}`}
                    className={styles.railCard}
                    style={{ textDecoration: "none" }}
                  >
                    <div className={styles.railThumb} style={thumbStyle}>
                      <div className={styles.railProgress}>
                        <div className={styles.railProgressFill} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className={styles.railInfo}>
                      <div className={styles.railTitle}>{item.video.title}</div>
                      {item.video.metadata?.year && (
                        <div className={styles.railYear}>{item.video.metadata.year}</div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}

        {/* All titles list */}
        <div className={styles.sectionTitle}>{strings.allTitles}</div>
        {items.map((item) => {
          const pct =
            item.video.durationSeconds > 0
              ? (item.progressSeconds / item.video.durationSeconds) * 100
              : 0;
          const thumbStyle = item.video.metadata?.posterUrl
            ? { backgroundImage: `url(${item.video.metadata.posterUrl})` }
            : undefined;
          const meta = [item.video.metadata?.year, item.video.metadata?.genre]
            .filter(Boolean)
            .join(" · ");

          return (
            <div key={item.id} className={styles.listRow}>
              <div className={styles.listThumb} style={thumbStyle} />
              <div className={styles.listInfo}>
                <div className={styles.listTitle}>{item.video.title}</div>
                {meta && <div className={styles.listMeta}>{meta}</div>}
              </div>
              <div className={styles.listProgress}>
                <div className={styles.listProgressFill} style={{ width: `${pct}%` }} />
              </div>
              <button
                className={styles.removeBtn}
                onClick={() => handleRemove(item.id)}
                title={strings.removeAriaLabel}
                type="button"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
