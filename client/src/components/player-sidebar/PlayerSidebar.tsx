import { mergeClasses } from "@griffel/react";
import React, { type FC } from "react";
import { graphql, useFragment } from "react-relay";
import { Link, useNavigate } from "react-router-dom";

import { IconArrowLeft, IconPlay } from "~/lib/icons.js";
import type { PlayerSidebar_video$key } from "~/relay/__generated__/PlayerSidebar_video.graphql.js";
import { formatDuration } from "~/utils/formatters.js";

import { strings } from "./PlayerSidebar.strings.js";
import { usePlayerSidebarStyles } from "./PlayerSidebar.styles.js";

const VIDEO_FRAGMENT = graphql`
  fragment PlayerSidebar_video on Video {
    id
    title
    durationSeconds
    metadata {
      title
      year
      genre
      plot
      posterUrl
    }
    library {
      videos(first: 6) {
        edges {
          node {
            id
            title
            metadata {
              year
              posterUrl
            }
          }
        }
      }
    }
    videoStream {
      height
      width
    }
  }
`;

interface Props {
  video: PlayerSidebar_video$key;
  hidden?: boolean;
}

export const PlayerSidebar: FC<Props> = ({ video, hidden }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const styles = usePlayerSidebarStyles();
  const navigate = useNavigate();

  const meta = data.metadata;
  const displayTitle = meta?.title ?? data.title;
  const metaLine = [meta?.year, meta?.genre, formatDuration(data.durationSeconds)]
    .filter(Boolean)
    .join(" · ");

  // Up Next: other videos from the same library, excluding current
  const upNext = (data.library?.videos.edges ?? [])
    .map((e) => e.node)
    .filter((v) => v.id !== data.id)
    .slice(0, 4);

  return (
    <div className={mergeClasses(styles.root, hidden === true && styles.rootHidden)}>
      {/* Now Playing */}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>{strings.nowPlaying}</div>
        <div className={styles.title}>{displayTitle}</div>
        {metaLine && <div className={styles.meta}>{metaLine}</div>}
        {meta?.plot && <div className={styles.plot}>{meta.plot}</div>}
      </div>

      {/* Scrollable body */}
      <div className={styles.body}>
        {/* Up Next */}
        {upNext.length > 0 && (
          <div className={styles.upNextSection}>
            <div className={styles.sectionLabel}>{strings.upNext}</div>
            {upNext.map((v) => {
              const thumbStyle = v.metadata?.posterUrl
                ? { backgroundImage: `url(${v.metadata.posterUrl})` }
                : undefined;
              return (
                <Link key={v.id} to={`/player/${v.id}`} className={styles.upNextItem}>
                  <div className={styles.upNextThumb} style={thumbStyle} />
                  <div className={styles.upNextInfo}>
                    <div className={styles.upNextTitle}>{v.title}</div>
                    {v.metadata?.year && <div className={styles.upNextYear}>{v.metadata.year}</div>}
                  </div>
                  <span className={styles.upNextPlay}>
                    <IconPlay size={9} />
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className={styles.footer}>
        <button className={styles.backBtn} onClick={() => navigate(-1)} type="button">
          <IconArrowLeft size={12} />
          {strings.back}
        </button>
      </div>
    </div>
  );
};
