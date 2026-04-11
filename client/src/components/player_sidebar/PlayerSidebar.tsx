import React, { type FC } from "react";
import { graphql, useFragment } from "react-relay";

import type { PlayerSidebar_video$key } from "~/relay/__generated__/PlayerSidebar_video.graphql.js";
import { formatDuration, maxResolutionForHeight } from "~/utils/formatters.js";

const VIDEO_FRAGMENT = graphql`
  fragment PlayerSidebar_video on Video {
    title
    durationSeconds
    videoStream {
      height
      width
    }
  }
`;

interface Props {
  video: PlayerSidebar_video$key;
}

export const PlayerSidebar: FC<Props> = ({ video }) => {
  const data = useFragment(VIDEO_FRAGMENT, video);

  const resolution = maxResolutionForHeight(data.videoStream?.height, data.videoStream?.width);

  return (
    <div
      style={{
        width: 360,
        flexShrink: 0,
        background: "#141420",
        borderLeft: "1px solid #2a2a40",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Media Info section */}
      <div style={{ padding: 20, borderBottom: "1px solid #2a2a40" }}>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#555570",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
            marginBottom: 16,
          }}
        >
          Now Playing
        </div>

        {/* Poster placeholder */}
        <div
          style={{
            width: "100%",
            aspectRatio: "16/9",
            background: "#1a1a2e",
            borderRadius: 12,
            overflow: "hidden",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundImage: "linear-gradient(135deg, #1a1a2e, #232340)",
          }}
        >
          <svg
            viewBox="0 0 48 48"
            style={{ width: 48, height: 48, fill: "#555570" }}
            aria-hidden="true"
          >
            <path d="M8 8h32a2 2 0 0 1 2 2v28a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2zm0 2v28h32V10H8zm12 7l12 7-12 7V17z" />
          </svg>
        </div>

        {/* Title */}
        <div
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "#f0f0f5",
            marginBottom: 12,
            lineHeight: 1.3,
          }}
        >
          {data.title}
        </div>

        {/* Meta row */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 13,
            color: "#8888a0",
            marginBottom: 16,
          }}
        >
          {/* Duration */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <svg
              viewBox="0 0 16 16"
              style={{ width: 16, height: 16, fill: "currentColor" }}
              aria-hidden="true"
            >
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 1.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM7.25 4v4.25l3.25 1.95-.5.83L6.5 8.75V4h.75z" />
            </svg>
            {formatDuration(data.durationSeconds)}
          </div>
        </div>

        {/* Resolution badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "4px 10px",
            background: "rgba(212, 168, 75, 0.15)",
            color: "#d4a84b",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {resolution}
        </div>
      </div>
    </div>
  );
};
