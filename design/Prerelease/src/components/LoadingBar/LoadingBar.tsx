/**
 * LoadingBar — top-of-viewport progress indicator.
 *
 * Rendered once inside AppShell. Subscribes to LoadingBarContext and drives a
 * three-phase state machine:
 *
 *   idle       bar hidden, nothing rendered
 *   loading    fake progress grows 0 → ~88% (CSS keyframe, deceleration curve)
 *              a bright spark rides the leading edge
 *              a sheen highlight sweeps along the filled portion
 *   completing loading just became false → bar snaps to 100%, then fades out
 *
 * The "completing" exit animation (300ms fill-to-full + 250ms fade) provides
 * visual confirmation that the load succeeded without abruptly vanishing.
 */

import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useState } from "react";
import { useLoadingBarState } from "./LoadingBarContext.js";
import { useLoadingBarStyles } from "./LoadingBar.styles.js";

type Phase = "idle" | "loading" | "completing";

export const LoadingBar: FC = () => {
  const isLoading = useLoadingBarState();
  const [phase, setPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (isLoading) {
      setPhase("loading");
      return;
    }
    // loading just became false — only transition if we were loading
    setPhase((prev) => {
      if (prev === "idle") return "idle";
      return "completing";
    });
  }, [isLoading]);

  useEffect(() => {
    if (phase !== "completing") return;
    // After the bar fills to 100% and fades out, return to idle
    const t = setTimeout(() => setPhase("idle"), 650);
    return () => clearTimeout(t);
  }, [phase]);

  const styles = useLoadingBarStyles();

  if (phase === "idle") return null;

  return (
    <div className={styles.root} aria-hidden="true">
      <div className={mergeClasses(styles.track, phase === "loading" && styles.trackLoading, phase === "completing" && styles.trackCompleting)}>
        <div className={styles.sheen} />
        <div className={styles.spark} />
      </div>
    </div>
  );
};
