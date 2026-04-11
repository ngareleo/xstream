import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC } from "react";
import { graphql, useFragment } from "react-relay";
import { Link } from "react-router-dom";

import { IconClose, IconPencil, IconPlay } from "~/lib/icons.js";
import type { FilmDetailPane_video$key } from "~/relay/__generated__/FilmDetailPane_video.graphql.js";
import { formatDuration, formatFileSize } from "~/utils/formatters.js";

import { createFilmDetailPaneClosedEvent } from "./FilmDetailPane.events.js";
import { useFilmDetailPaneStyles } from "./FilmDetailPane.styles.js";

const DETAIL_FRAGMENT = graphql`
  fragment FilmDetailPane_video on Video {
    id
    title
    filename
    durationSeconds
    fileSizeBytes
    bitrate
    matched
    mediaType
    metadata {
      imdbId
      title
      year
      genre
      director
      cast
      rating
      plot
      posterUrl
    }
    videoStream {
      codec
      width
      height
      fps
    }
    audioStream {
      codec
      channels
      sampleRate
    }
  }
`;

interface Props {
  video: FilmDetailPane_video$key;
}

export const FilmDetailPane: FC<Props> = ({ video }) => {
  const data = useFragment(DETAIL_FRAGMENT, video);
  const styles = useFilmDetailPaneStyles();
  const { bubble } = useNovaEventing();

  const meta = data.metadata;
  const vs = data.videoStream;
  const as = data.audioStream;

  const displayTitle = meta?.title ?? data.title;
  const subLine = [meta?.year, meta?.genre].filter(Boolean).join(" · ");
  const isHd = (vs?.height ?? 0) >= 2160;

  const posterStyle = meta?.posterUrl
    ? {
        backgroundImage: `url(${meta.posterUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      }
    : { background: "linear-gradient(135deg, #1a0a0a 0%, #2d0d10 50%, #0f0f0f 100%)" };

  return (
    <div className={styles.root}>
      {/* Poster area */}
      <div className={styles.posterArea} style={posterStyle}>
        <div className={styles.posterOverlay} />

        {/* Action bar */}
        <div className={styles.actionBar}>
          {data.matched && (
            <Link
              to={`/player/${data.id}`}
              className={mergeClasses(styles.actionBtn, styles.actionBtnPrimary)}
            >
              <IconPlay size={10} />
              Play
            </Link>
          )}
          <div className={styles.actionSep} />
          <button className={styles.actionBtn}>
            <IconPencil size={10} />
            {data.matched ? "Re-link" : "Link"}
          </button>
          <div className={styles.actionSpacer} />
          <button
            className={styles.closeBtn}
            onClick={(e) =>
              void bubble({ reactEvent: e, event: createFilmDetailPaneClosedEvent() })
            }
            title="Close"
          >
            <IconClose size={14} />
          </button>
        </div>

        {/* Title/meta over poster */}
        <div className={styles.posterMeta}>
          <div className={styles.posterTitle}>{displayTitle}</div>
          {subLine ? <div className={styles.posterSub}>{subLine}</div> : null}
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        {meta ? (
          <>
            {/* Badges row */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>Details</div>
              <div className={styles.badgesRow}>
                {isHd && <span className={mergeClasses(styles.badge, styles.badgeRed)}>4K</span>}
                {vs && !isHd && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>HD</span>
                )}
                {data.mediaType === "MOVIES" && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>Movie</span>
                )}
                {data.mediaType === "TV_SHOWS" && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>TV</span>
                )}
                {vs?.codec && (
                  <span className={mergeClasses(styles.badge, styles.badgeGray)}>
                    {vs.codec.toUpperCase()}
                  </span>
                )}
              </div>
            </div>

            {/* IMDb rating */}
            {meta.rating != null && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Rating</div>
                <div className={styles.ratingRow}>
                  <span className={styles.ratingNum}>★ {meta.rating.toFixed(1)}</span>
                  <span className={styles.ratingLabel}>IMDb</span>
                </div>
              </div>
            )}

            {/* Plot */}
            {meta.plot && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Synopsis</div>
                <div className={styles.plot}>{meta.plot}</div>
              </div>
            )}

            {/* Cast */}
            {meta.cast.length > 0 && (
              <div className={styles.section}>
                <div className={styles.sectionLabel}>Cast</div>
                <div className={styles.castChips}>
                  {meta.cast.map((name) => (
                    <span key={name} className={styles.castChip}>
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* File info */}
            <div className={styles.section}>
              <div className={styles.sectionLabel}>File</div>
              {vs && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>Resolution</span>
                  <span className={styles.infoVal}>
                    {vs.width}×{vs.height}
                  </span>
                </div>
              )}
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>Duration</span>
                <span className={styles.infoVal}>{formatDuration(data.durationSeconds)}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoKey}>Size</span>
                <span className={styles.infoVal}>{formatFileSize(data.fileSizeBytes)}</span>
              </div>
              {as && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>Audio</span>
                  <span className={styles.infoVal}>
                    {as.codec.toUpperCase()} {as.channels}ch
                  </span>
                </div>
              )}
              {meta.director && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>Director</span>
                  <span className={styles.infoVal}>{meta.director}</span>
                </div>
              )}
              {meta.imdbId && (
                <div className={styles.infoRow}>
                  <span className={styles.infoKey}>IMDb</span>
                  <span className={styles.infoVal}>{meta.imdbId}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.emptyMeta}>
            <div>No metadata matched</div>
            <div style={{ marginTop: 6 }}>
              Use the <strong>Link</strong> button above to match this file.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
