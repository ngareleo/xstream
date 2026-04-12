import { mergeClasses } from "@griffel/react";
import { useNovaEventing } from "@nova/react";
import React, { type FC } from "react";
import { graphql, useFragment } from "react-relay";
import { Link } from "react-router-dom";

import { IconPlay, IconQuestion } from "~/lib/icons.js";
import type { PosterCard_video$key } from "~/relay/__generated__/PosterCard_video.graphql.js";
import { upgradePosterUrl } from "~/utils/formatters.js";

import { createPosterCardFilmSelectedEvent } from "./PosterCard.events.js";
import { playQuoteForId, strings } from "./PosterCard.strings.js";
import { usePosterCardStyles } from "./PosterCard.styles.js";

const POSTER_FRAGMENT = graphql`
  fragment PosterCard_video on Video {
    id
    title
    matched
    mediaType
    metadata {
      year
      rating
      posterUrl
    }
    videoStream {
      height
    }
  }
`;

// Gradient placeholders indexed by video id hash for visual variety
const GRADIENTS = [
  "linear-gradient(135deg, #1a0a0a 0%, #3d0b0b 50%, #0a0a0a 100%)",
  "linear-gradient(135deg, #0a0a1a 0%, #0b1a3d 50%, #0a0a0a 100%)",
  "linear-gradient(135deg, #0a1a0a 0%, #0b3d1a 50%, #0a0a0a 100%)",
  "linear-gradient(135deg, #1a0f0a 0%, #3d2008 50%, #0a0a0a 100%)",
  "linear-gradient(135deg, #12080f 0%, #2e0a24 50%, #0a0a0a 100%)",
  "linear-gradient(135deg, #080e1a 0%, #0a2040 50%, #0a0a0a 100%)",
];

function gradientForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return GRADIENTS[hash % GRADIENTS.length];
}

interface Props {
  video: PosterCard_video$key;
  isSelected?: boolean;
}

export const PosterCard: FC<Props> = ({ video, isSelected = false }) => {
  const data = useFragment(POSTER_FRAGMENT, video);
  const styles = usePosterCardStyles();
  const { bubble } = useNovaEventing();

  const isHd = (data.videoStream?.height ?? 0) >= 2160;
  const posterUrl = data.metadata?.posterUrl;
  const bgStyle = posterUrl
    ? { backgroundImage: `url(${upgradePosterUrl(posterUrl)})` }
    : { backgroundImage: gradientForId(data.id) };

  const handleClick = (e: React.MouseEvent): void => {
    void bubble({ reactEvent: e, event: createPosterCardFilmSelectedEvent(data.id) });
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      void bubble({ reactEvent: e, event: createPosterCardFilmSelectedEvent(data.id) });
    }
  };

  return (
    <div
      className={mergeClasses(styles.root, isSelected && styles.rootSelected)}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className={styles.inner}>
        {/* Background */}
        <div className={mergeClasses(styles.bg, !posterUrl && styles.bgAnimated)} style={bgStyle} />
        <div className={styles.bottomGradient} />
        <div
          className={mergeClasses(styles.hoverOverlay, isSelected && styles.hoverOverlayVisible)}
        />

        {/* Top-right badge */}
        <div className={styles.badgeTopRight}>
          <span className={mergeClasses(styles.badge, isHd ? styles.badgeRed : styles.badgeGray)}>
            {isHd ? strings.badge4K : strings.badgeHD}
          </span>
        </div>

        {/* Top-left: unmatched indicator */}
        {!data.matched && (
          <div className={styles.badgeTopLeft}>
            <span className={mergeClasses(styles.badge, styles.badgeYellow)}>
              <IconQuestion size={8} />
            </span>
          </div>
        )}

        {/* Play chip (hover) — always shown when selected */}
        {data.matched && (
          <Link
            to={`/player/${encodeURIComponent(data.id)}`}
            className={mergeClasses(styles.playChip, isSelected && styles.playChipVisible)}
            onClick={(e) => e.stopPropagation()}
          >
            <IconPlay size={9} />
            {playQuoteForId(data.id)}
          </Link>
        )}

        {/* Bottom info */}
        <div className={styles.bottomInfo}>
          <div className={styles.title}>{data.title}</div>
          {data.metadata?.year && <div className={styles.year}>{data.metadata.year}</div>}
        </div>

        {/* Rating */}
        {data.metadata?.rating != null && (
          <div className={styles.rating}>★ {data.metadata.rating.toFixed(1)}</div>
        )}
      </div>
    </div>
  );
};
