import { makeStyles, mergeClasses } from "@griffel/react";
import React, { type FC, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";
import { useNavigate, useParams } from "react-router-dom";

import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import { PlayerSidebarAsync } from "~/components/player-sidebar/PlayerSidebarAsync.js";
import { VideoPlayerAsync } from "~/components/video-player/VideoPlayerAsync.js";
import { IconArrowLeft } from "~/lib/icons.js";
import type { PlayerPageQuery } from "~/relay/__generated__/PlayerPageQuery.graphql.js";
import { tokens } from "~/styles/tokens.js";

const GRAIN_URL =
  "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E\")";

const usePlayerStyles = makeStyles({
  // ── Root: full-screen CSS grid ──────────────────────────────────────────────
  root: {
    position: "fixed",
    inset: "0",
    display: "grid",
    gridTemplateColumns: `1fr ${tokens.playerPanelWidth}`,
    overflow: "hidden",
    backgroundColor: "#000",
    fontFamily: tokens.fontBody,
    outline: "none",
    transitionProperty: "grid-template-columns",
    transitionDuration: "0.4s",
    transitionTimingFunction: "ease",
  },
  rootHidden: {
    gridTemplateColumns: "1fr 0px",
    cursor: "none",
  },

  // ── Video area ──────────────────────────────────────────────────────────────
  videoArea: {
    position: "relative",
    overflow: "hidden",
    backgroundColor: "#000",
  },

  // Atmospheric background — renders behind the video element
  scene: {
    position: "absolute",
    inset: "0",
    zIndex: "0",
    pointerEvents: "none",
    background:
      "linear-gradient(135deg, #050510 0%, #0a0518 25%, #060606 50%, #100808 75%, #050505 100%)",
  },

  // Film-grain noise overlay — sits on top of the video frame
  grain: {
    position: "absolute",
    inset: "0",
    zIndex: "2",
    opacity: "0.35",
    pointerEvents: "none",
    backgroundImage: GRAIN_URL,
  },

  // Top + bottom gradient vignette — letter-box style fade
  letterbox: {
    position: "absolute",
    inset: "0",
    zIndex: "3",
    pointerEvents: "none",
    background:
      "linear-gradient(to bottom, rgba(0,0,0,0.80) 0%, transparent 10%, transparent 88%, rgba(0,0,0,0.85) 100%)",
  },

  // VideoPlayer lives here, z-index 1 so scene shows through before playback
  videoWrapper: {
    position: "absolute",
    inset: "0",
    zIndex: "1",
  },

  // ── Topbar — absolute overlay at top of video area ──────────────────────────
  topBar: {
    position: "absolute",
    top: "0",
    left: "0",
    right: "0",
    display: "flex",
    alignItems: "center",
    padding: "16px 20px",
    gap: "12px",
    background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
    zIndex: "10",
    transitionProperty: "opacity",
    transitionDuration: "0.4s",
    transitionTimingFunction: "ease",
  },
  topBarHidden: {
    opacity: "0",
    pointerEvents: "none",
  },

  backBtn: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    color: "rgba(255,255,255,0.55)",
    fontSize: "13px",
    fontWeight: "500",
    background: "none",
    border: "none",
    padding: "0",
    cursor: "pointer",
    fontFamily: "inherit",
    transitionProperty: "color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorWhite,
    },
  },
  topDivider: {
    width: "1px",
    height: "14px",
    backgroundColor: "rgba(255,255,255,0.12)",
    flexShrink: "0",
  },
  videoTitle: {
    fontSize: "14px",
    fontWeight: "700",
    color: tokens.colorWhite,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // ── Loading skeleton (Suspense fallback) ────────────────────────────────────
  skeleton: {
    position: "absolute",
    inset: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    border: `3px solid rgba(255,255,255,0.12)`,
    borderTopColor: "rgba(206,17,38,0.85)",
    animationName: {
      to: { transform: "rotate(360deg)" },
    },
    animationDuration: "0.75s",
    animationTimingFunction: "linear",
    animationIterationCount: "infinite",
  },

  // ── Error / not-found states ───────────────────────────────────────────────
  notFound: {
    padding: "32px",
    color: "#f0f0f5",
  },
});

const VIDEO_QUERY = graphql`
  query PlayerPageQuery($id: ID!) {
    video(id: $id) {
      title
      ...VideoPlayer_video
      ...PlayerSidebar_video
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

const INACTIVITY_MS = 3000;

// ─── PlayerContent ────────────────────────────────────────────────────────────

const PlayerContent: FC<{ videoId: string }> = ({ videoId }) => {
  const navigate = useNavigate();
  const styles = usePlayerStyles();
  const data = useLazyLoadQuery<PlayerPageQuery>(VIDEO_QUERY, { id: videoId });

  const [controlsHidden, setControlsHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const resetTimer = useCallback((): void => {
    setControlsHidden(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setControlsHidden(true), INACTIVITY_MS);
  }, []);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [resetTimer]);

  if (!data.video) {
    return <div className={styles.notFound}>Video not found.</div>;
  }

  return (
    <DevThrowTarget id="Player">
      <div
        ref={rootRef}
        className={mergeClasses(styles.root, controlsHidden && styles.rootHidden)}
        onMouseMove={resetTimer}
        onKeyDown={resetTimer}
        tabIndex={0}
      >
        {/* ── Video column ─────────────────────────────────────────────────── */}
        <div className={styles.videoArea}>
          {/* Atmospheric layers */}
          <div className={styles.scene} />
          <div className={styles.grain} />
          <div className={styles.letterbox} />

          {/* MSE video player */}
          <Suspense
            fallback={
              <div className={styles.skeleton}>
                <div className={styles.spinner} />
              </div>
            }
          >
            <div className={styles.videoWrapper}>
              <VideoPlayerAsync video={data.video} />
            </div>
          </Suspense>

          {/* Topbar overlay */}
          <div className={mergeClasses(styles.topBar, controlsHidden && styles.topBarHidden)}>
            <button
              className={styles.backBtn}
              onClick={() => navigate(-1)}
              aria-label="Go back"
              type="button"
            >
              <IconArrowLeft size={14} />
              Back
            </button>
            <div className={styles.topDivider} />
            <div className={styles.videoTitle}>{data.video.title}</div>
          </div>
        </div>

        {/* ── Side panel column ────────────────────────────────────────────── */}
        <Suspense fallback={null}>
          <PlayerSidebarAsync video={data.video} hidden={controlsHidden} />
        </Suspense>
      </div>
    </DevThrowTarget>
  );
};

// ─── PlayerPage ───────────────────────────────────────────────────────────────

export const PlayerPage: FC = () => {
  const { videoId } = useParams<{ videoId: string }>();
  const styles = usePlayerStyles();

  if (!videoId) {
    return <div className={styles.notFound}>Invalid video ID.</div>;
  }

  return (
    <Suspense
      fallback={
        <div className={styles.root} style={{ alignItems: "center", justifyContent: "center" }}>
          <div className={styles.spinner} />
        </div>
      }
    >
      <PlayerContent videoId={resolveVideoId(videoId)} />
    </Suspense>
  );
};
