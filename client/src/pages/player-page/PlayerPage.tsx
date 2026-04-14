import { type FC, Suspense } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useParams } from "react-router-dom";

import { DevThrowTarget } from "~/components/dev-throw-target/DevThrowTarget.js";
import { DevPanelAsync } from "~/components/dev-tools/DevPanelAsync.js";
import { DevToolsProvider } from "~/components/dev-tools/DevToolsContext.js";
import { PlayerContent } from "~/components/player-content/PlayerContent.js";
import { StreamingLogOverlayAsync } from "~/components/stream-log-overlay/StreamingLogOverlayAsync.js";
import type { PlayerPageQuery } from "~/relay/__generated__/PlayerPageQuery.graphql.js";

import { strings } from "./PlayerPage.strings.js";
import { usePlayerStyles } from "./PlayerPage.styles.js";

const VIDEO_QUERY = graphql`
  query PlayerPageQuery($id: ID!) {
    video(id: $id) {
      ...PlayerContent_video
    }
  }
`;

function resolveVideoId(param: string): string {
  const decoded = decodeURIComponent(param);
  try {
    if (atob(decoded).startsWith("Video:")) return decoded;
  } catch {
    // not valid base64 — fall through
  }
  return btoa(`Video:${decoded}`);
}

// ─── PlayerPageInner ──────────────────────────────────────────────────────────
// Data-fetching bridge: issues useLazyLoadQuery (must be inside Suspense) and
// hands the fragment key off to PlayerContent. Contains no UI of its own.

const PlayerPageInner: FC<{ videoId: string }> = ({ videoId }) => {
  const styles = usePlayerStyles();
  const data = useLazyLoadQuery<PlayerPageQuery>(VIDEO_QUERY, { id: videoId });
  if (!data.video) return <div className={styles.notFound}>{strings.videoNotFound}</div>;
  return <PlayerContent video={data.video} />;
};

// ─── PlayerPage ───────────────────────────────────────────────────────────────

export const PlayerPage: FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const styles = usePlayerStyles();

  return (
    <DevToolsProvider>
      {!videoId ? (
        <DevThrowTarget id="Player">
          <div className={styles.notFound}>{strings.invalidVideoId}</div>
        </DevThrowTarget>
      ) : (
        <DevThrowTarget id="Player">
          <Suspense
            fallback={
              <div className={styles.rootFallback}>
                <div className={styles.spinner} />
              </div>
            }
          >
            <PlayerPageInner videoId={resolveVideoId(videoId)} />
          </Suspense>
        </DevThrowTarget>
      )}
      <DevPanelAsync />
      <StreamingLogOverlayAsync />
    </DevToolsProvider>
  );
};
