import { mergeClasses } from "@griffel/react";
import { type FC, useRef } from "react";
import { graphql, useFragment } from "react-relay";
import { useNavigate } from "react-router-dom";

import { Poster } from "~/components/poster/Poster";
import { IconClose, IconPlay, ImdbBadge } from "~/lib/icons";
import type { ShowDetailsOverlay_show$key } from "~/relay/__generated__/ShowDetailsOverlay_show.graphql";

import { strings } from "./ShowDetailsOverlay.strings";
import { useShowDetailsOverlayStyles } from "./ShowDetailsOverlay.styles";

const SHOW_FRAGMENT = graphql`
  fragment ShowDetailsOverlay_show on Show
  @argumentDefinitions(posterSize: { type: "PosterSize!", defaultValue: W1600 }) {
    id
    title
    year
    metadata {
      title
      year
      genre
      director
      plot
      rating
      overlayPoster: posterUrl(size: $posterSize)
    }
    profiles {
      id
      name
      status
    }
    seasons {
      seasonNumber
      episodes {
        seasonNumber
        episodeNumber
        title
        durationSeconds
        onDisk
        bestCopy {
          id
        }
      }
    }
  }
`;

interface ShowDetailsOverlayProps {
  show: ShowDetailsOverlay_show$key;
  onClose: () => void;
}

export const ShowDetailsOverlay: FC<ShowDetailsOverlayProps> = ({ show, onClose }) => {
  const data = useFragment(SHOW_FRAGMENT, show);
  const styles = useShowDetailsOverlayStyles();
  const navigate = useNavigate();
  const overlayRef = useRef<HTMLDivElement>(null);

  const sanitisedTitle = data.metadata?.title ?? data.title;
  const altText = sanitisedTitle || data.title;
  const titleText = sanitisedTitle || strings.unmatched;

  const totalEpisodes = data.seasons.reduce((sum, s) => sum + s.episodes.length, 0);
  const availableEpisodes = data.seasons.reduce(
    (sum, s) => sum + s.episodes.filter((e) => e.onDisk).length,
    0
  );
  const seasonCount = data.seasons.length;

  // First on-disk episode across all seasons — drives the default play CTA.
  const firstPlayable = data.seasons.flatMap((s) => s.episodes).find((e) => e.onDisk && e.bestCopy);

  const playFirst = (): void => {
    if (firstPlayable?.bestCopy) {
      navigate(`/player/${firstPlayable.bestCopy.id}`);
    }
  };

  const playEpisode = (videoId: string): void => {
    navigate(`/player/${videoId}`);
  };

  return (
    <div ref={overlayRef} className={styles.overlay}>
      <div className={styles.hero}>
        <Poster
          url={data.metadata?.overlayPoster ?? null}
          alt={altText}
          className={styles.poster}
        />
        <div className={styles.gradient} />
        <button
          type="button"
          onClick={onClose}
          aria-label={strings.closeAriaLabel}
          className={styles.close}
        >
          <IconClose />
        </button>
        <div className={mergeClasses(styles.content, styles.contentWithRail)}>
          <div className={styles.chips}>
            {data.metadata?.rating !== null && data.metadata?.rating !== undefined && (
              <span className={styles.rating}>
                <ImdbBadge />
                {data.metadata.rating}
              </span>
            )}
          </div>
          <div className={styles.title}>{titleText}</div>
          <div className={styles.metaRow}>
            {[data.metadata?.year ?? data.year, data.metadata?.genre]
              .filter((v): v is string | number => v !== null && v !== undefined)
              .join(" · ")}
          </div>
          {data.metadata?.director && (
            <div className={styles.director}>
              {strings.directedBy}
              <span className={styles.directorName}>{data.metadata.director}</span>
            </div>
          )}
          {data.metadata?.plot && <div className={styles.plot}>{data.metadata.plot}</div>}
          <div className={styles.actions}>
            <button
              type="button"
              onClick={playFirst}
              disabled={!firstPlayable}
              className={styles.playCta}
            >
              <IconPlay />
              <span>{strings.play}</span>
            </button>
          </div>
        </div>

        {seasonCount > 0 && (
          <aside className={styles.seasonsRail} aria-label={strings.seasonsAriaLabel}>
            <div className={styles.seasonsRailHeader}>
              <span className={styles.seasonsRailLabel}>
                {seasonCount} {seasonCount === 1 ? strings.season : strings.seasons}
              </span>
              <span className={styles.seasonsRailStat}>
                {strings.formatString(strings.onDiskFormat, {
                  onDisk: availableEpisodes,
                  total: totalEpisodes,
                })}
              </span>
            </div>
            <div className={styles.seasonsRailScroll}>
              {data.seasons.map((s) => (
                <div key={s.seasonNumber}>
                  <div style={{ padding: "8px 12px", fontSize: 11, opacity: 0.7 }}>
                    Season {s.seasonNumber}
                  </div>
                  {s.episodes.map((ep) => (
                    <button
                      key={`${ep.seasonNumber}-${ep.episodeNumber}`}
                      type="button"
                      disabled={!ep.onDisk || !ep.bestCopy}
                      onClick={() => ep.bestCopy && playEpisode(ep.bestCopy.id)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "6px 12px",
                        background: "transparent",
                        border: "none",
                        color: ep.onDisk ? "inherit" : "rgba(255,255,255,0.4)",
                        cursor: ep.onDisk ? "pointer" : "default",
                        fontSize: 12,
                      }}
                    >
                      E{ep.episodeNumber}. {ep.title ?? "—"}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
