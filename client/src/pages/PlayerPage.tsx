import React, { type FC, Suspense } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useNavigate, useParams } from "react-router-dom";

import { PlayerSidebarAsync } from "~/components/player_sidebar/PlayerSidebarAsync.js";
import { VideoPlayerAsync } from "~/components/video_player/VideoPlayerAsync.js";
import type { PlayerPageQuery } from "~/relay/__generated__/PlayerPageQuery.graphql.js";

const VIDEO_QUERY = graphql`
  query PlayerPageQuery($id: ID!) {
    video(id: $id) {
      title
      ...VideoPlayer_video
      ...PlayerSidebar_video
    }
  }
`;

/**
 * Normalise the route param to a Relay global ID.
 * The param is URL-encoded by VideoCard (encodeURIComponent); decode first.
 * If the decoded value already looks like a Relay global ID (decodes to "Video:…"),
 * use it as-is. Otherwise treat it as a bare local ID and wrap it.
 */
function resolveVideoId(param: string): string {
  const decoded = decodeURIComponent(param);
  try {
    if (atob(decoded).startsWith("Video:")) return decoded;
  } catch {
    // not valid base64 — fall through
  }
  return btoa(`Video:${decoded}`);
}

const PlayerContent: FC<{ videoId: string }> = ({ videoId }) => {
  const navigate = useNavigate();
  const data = useLazyLoadQuery<PlayerPageQuery>(VIDEO_QUERY, { id: videoId });

  if (!data.video) {
    return <div style={{ padding: 32, color: "#f0f0f5" }}>Video not found.</div>;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0f",
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      {/* Header — renders immediately from Relay data, before player chunks load */}
      <div
        style={{
          height: 60,
          background: "#141420",
          borderBottom: "1px solid #2a2a40",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 24px",
          flexShrink: 0,
          zIndex: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              background: "none",
              border: "none",
              color: "#8888a0",
              cursor: "pointer",
              padding: "8px 12px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
            }}
            aria-label="Go back"
          >
            <svg
              viewBox="0 0 20 20"
              style={{ width: 20, height: 20, fill: "currentColor" }}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            Back
          </button>
          <span
            style={{
              fontSize: 16,
              fontWeight: 600,
              color: "#f0f0f5",
              maxWidth: 400,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {data.video.title}
          </span>
        </div>

        <nav style={{ display: "flex", gap: 8 }}>
          <span
            style={{
              color: "#0a0a0f",
              background: "#d4a84b",
              padding: "8px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            Player
          </span>
        </nav>
      </div>

      {/* Body — deferred: VideoPlayer and PlayerSidebar are lazy chunks */}
      <Suspense
        fallback={
          <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
            <div style={{ flex: 1, background: "#000" }} />
            <div
              style={{
                width: 360,
                flexShrink: 0,
                background: "#141420",
                borderLeft: "1px solid #2a2a40",
              }}
            />
          </div>
        }
      >
        <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
          <div style={{ flex: 1, position: "relative", background: "#000" }}>
            <VideoPlayerAsync video={data.video} />
          </div>
          <PlayerSidebarAsync video={data.video} />
        </div>
      </Suspense>
    </div>
  );
};

export const PlayerPage: FC = () => {
  const { videoId } = useParams<{ videoId: string }>();

  if (!videoId) {
    return <div style={{ padding: 32, color: "#f0f0f5" }}>Invalid video ID.</div>;
  }

  return (
    <Suspense
      fallback={
        <div
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0a0a0f",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: "3px solid #2a2a40",
              borderTopColor: "#d4a84b",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      }
    >
      <PlayerContent videoId={resolveVideoId(videoId)} />
    </Suspense>
  );
};
