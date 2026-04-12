import { mergeClasses } from "@griffel/react";
import { type FC, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { graphql, useFragment } from "react-relay";
import { useNavigate } from "react-router-dom";

import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import { PlayerSidebarAsync } from "~/components/player-sidebar/PlayerSidebarAsync.js";
import { VideoPlayerAsync } from "~/components/video-player/VideoPlayerAsync.js";
import { IconArrowLeft } from "~/lib/icons.js";
import type { PlayerContent_video$key } from "~/relay/__generated__/PlayerContent_video.graphql.js";

import { strings } from "./PlayerContent.strings.js";
import { usePlayerContentStyles } from "./PlayerContent.styles.js";

const FRAGMENT = graphql`
  fragment PlayerContent_video on Video {
    title
    ...VideoPlayer_video
    ...PlayerSidebar_video
  }
`;

const INACTIVITY_MS = 3000;

interface Props {
  video: PlayerContent_video$key;
}

export const PlayerContent: FC<Props> = ({ video }) => {
  const data = useFragment(FRAGMENT, video);
  const navigate = useNavigate();
  const styles = usePlayerContentStyles();

  const [controlsHidden, setControlsHidden] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  return (
    <DevThrowTarget id="Player">
      <div
        className={mergeClasses(styles.root, controlsHidden && styles.rootHidden)}
        onMouseMove={resetTimer}
        onKeyDown={resetTimer}
        tabIndex={0}
      >
        {/* ── Video column ─────────────────────────────────────────────────── */}
        <div className={styles.videoArea}>
          <div className={styles.scene} />
          <div className={styles.grain} />
          <div className={styles.letterbox} />

          <Suspense
            fallback={
              <div className={styles.skeleton}>
                <div className={styles.spinner} />
              </div>
            }
          >
            <div className={styles.videoWrapper}>
              <VideoPlayerAsync video={data} />
            </div>
          </Suspense>

          <div className={mergeClasses(styles.topBar, controlsHidden && styles.topBarHidden)}>
            <button
              className={styles.backBtn}
              onClick={() => navigate(-1)}
              aria-label={strings.backAriaLabel}
              type="button"
            >
              <IconArrowLeft size={14} />
              {strings.back}
            </button>
            <div className={styles.topDivider} />
            <div className={styles.videoTitle}>{data.title}</div>
          </div>
        </div>

        {/* ── Side panel column ────────────────────────────────────────────── */}
        <Suspense fallback={null}>
          <PlayerSidebarAsync video={data} hidden={controlsHidden} />
        </Suspense>
      </div>
    </DevThrowTarget>
  );
};
