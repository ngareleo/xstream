import { type FC, type MouseEvent } from "react";

import { strings } from "./EdgeHandle.strings.js";
import { useEdgeHandleStyles } from "./EdgeHandle.styles.js";

export const EDGE_DETECTION_ZONE_PX = 140;

interface EdgeHandleProps {
  cursorX: number;
  cursorY: number;
  onActivate: () => void;
}

export const EdgeHandle: FC<EdgeHandleProps> = ({ cursorX, cursorY, onActivate }) => {
  const styles = useEdgeHandleStyles();

  const viewportW = typeof window === "undefined" ? 1920 : window.innerWidth;
  const viewportH = typeof window === "undefined" ? 1080 : window.innerHeight;

  const distFromEdge = Math.max(0, viewportW - cursorX);
  const bulge = Math.max(0, Math.min(1, 1 - distFromEdge / EDGE_DETECTION_ZONE_PX));
  const eased = bulge * bulge * (3 - 2 * bulge);

  const handleHalfHeight = 22;
  const top = Math.max(handleHalfHeight + 8, Math.min(viewportH - handleHalfHeight - 8, cursorY));

  const translateX = (1 - eased) * 44;
  const scale = 0.92 + eased * 0.08;
  const opacity = eased;
  const interactive = eased > 0.08;

  return (
    <button
      type="button"
      aria-label={strings.openSidePanel}
      aria-hidden={!interactive}
      tabIndex={interactive ? 0 : -1}
      className={styles.handle}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onActivate();
      }}
      style={{
        top: `${top}px`,
        transform: `translate(${translateX}px, -50%) scale(${scale})`,
        opacity,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <span className={styles.chevron}>‹</span>
    </button>
  );
};
