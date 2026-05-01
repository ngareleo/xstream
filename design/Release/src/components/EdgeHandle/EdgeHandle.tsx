import { type FC, type MouseEvent } from "react";
import { useEdgeHandleStyles } from "./EdgeHandle.styles.js";

export const EDGE_DETECTION_ZONE_PX = 140;

interface EdgeHandleProps {
  /** Last known cursor X (clientX). */
  cursorX: number;
  /** Last known cursor Y (clientY). */
  cursorY: number;
  /** Called when the user clicks the handle. */
  onActivate: () => void;
}

/**
 * Right-edge handle — a glass lozenge that bulges out of the viewport's right
 * edge as the cursor approaches, scales with proximity, and vertically follows
 * the cursor. Click-to-activate (e.g. open a side drawer).
 *
 * The component is unconditional — render it whenever you want it eligible to
 * appear, and it self-hides via `opacity: 0` + `pointerEvents: none` when the
 * cursor is outside the detection zone.
 */
export const EdgeHandle: FC<EdgeHandleProps> = ({
  cursorX,
  cursorY,
  onActivate,
}) => {
  const styles = useEdgeHandleStyles();

  const viewportW =
    typeof window === "undefined" ? 1920 : window.innerWidth;
  const viewportH =
    typeof window === "undefined" ? 1080 : window.innerHeight;

  const distFromEdge = Math.max(0, viewportW - cursorX);
  const bulge = Math.max(
    0,
    Math.min(1, 1 - distFromEdge / EDGE_DETECTION_ZONE_PX),
  );

  // Easing — quadratic for a more "wave-like" acceleration as the cursor closes in.
  const eased = bulge * bulge * (3 - 2 * bulge);

  // Vertically follow the cursor, clamped so the lozenge stays inside the viewport.
  const handleHalfHeight = 54;
  const top = Math.max(
    handleHalfHeight + 8,
    Math.min(viewportH - handleHalfHeight - 8, cursorY),
  );

  // Off-screen → flush translation. At eased=0 the handle is fully tucked
  // behind the right edge; at eased=1 it sits flush against the edge.
  const translateX = (1 - eased) * 64;

  // Slight horizontal stretch + vertical squish at peak proximity for the
  // "wave bulging out" feel.
  const scaleX = 1 + eased * 0.18;
  const scaleY = 1 - eased * 0.04;

  const opacity = eased;
  const interactive = eased > 0.08;

  return (
    <button
      type="button"
      aria-label="Open side panel"
      aria-hidden={!interactive}
      tabIndex={interactive ? 0 : -1}
      className={styles.handle}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        e.stopPropagation();
        onActivate();
      }}
      style={{
        top: `${top}px`,
        transform: `translate(${translateX}px, -50%) scale(${scaleX}, ${scaleY})`,
        opacity,
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <span className={styles.chevron}>‹</span>
    </button>
  );
};
