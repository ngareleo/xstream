import { useNovaEventing } from "@nova/react";
import React, { type FC, type MouseEvent } from "react";
import { graphql, useFragment } from "react-relay";
import { Link } from "react-router-dom";

import { createPlayRequestedEvent } from "~/components/control-bar/ControlBar.events.js";
import type { PlayerEndScreen_video$key } from "~/relay/__generated__/PlayerEndScreen_video.graphql.js";

import { strings } from "./PlayerEndScreen.strings.js";
import { usePlayerEndScreenStyles } from "./PlayerEndScreen.styles.js";

const VIDEO_FRAGMENT = graphql`
  fragment PlayerEndScreen_video on Video
  @argumentDefinitions(posterSize: { type: "PosterSize!", defaultValue: W400 }) {
    id
    library {
      videos(first: 6) {
        edges {
          node {
            id
            title
            metadata {
              year
              tilePoster: posterUrl(size: $posterSize)
            }
          }
        }
      }
    }
  }
`;

interface Props {
  video: PlayerEndScreen_video$key;
}

export const PlayerEndScreen: FC<Props> = ({ video }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);
  const styles = usePlayerEndScreenStyles();
  const { bubble } = useNovaEventing();

  const suggestions = (data.library?.videos.edges ?? [])
    .map((e) => e.node)
    .filter((v) => v.id !== data.id)
    .slice(0, 4);

  const handleReplay = (reactEvent: MouseEvent): void => {
    void bubble({ reactEvent, event: createPlayRequestedEvent() });
  };

  return (
    <div className={styles.overlay}>
      {suggestions.length > 0 && (
        <>
          <div className={styles.label}>{strings.upNext}</div>
          <div className={styles.cards}>
            {suggestions.map((v) => {
              const thumbStyle = v.metadata?.tilePoster
                ? { backgroundImage: `url(${v.metadata.tilePoster})` }
                : undefined;
              return (
                <Link key={v.id} to={`/player/${encodeURIComponent(v.id)}`} className={styles.card}>
                  <div className={styles.cardPoster} style={thumbStyle} />
                  <div className={styles.cardTitle}>{v.title}</div>
                  {v.metadata?.year && <div className={styles.cardYear}>{v.metadata.year}</div>}
                </Link>
              );
            })}
          </div>
        </>
      )}
      <div className={styles.actions}>
        <button className={styles.replayBtn} onClick={handleReplay} type="button">
          {strings.replay}
        </button>
      </div>
    </div>
  );
};
