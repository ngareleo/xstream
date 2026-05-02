import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import { mergeClasses } from "@griffel/react";
import { IconBack, IconChevron } from "../../lib/icons.js";
import { TILE_STRIDE } from "../FilmTile/FilmTile.styles.js";
import { usePosterRowStyles } from "./PosterRow.styles.js";

const SCROLL_DURATION_MS = 1100;

const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

function smoothScrollBy(el: HTMLElement, dx: number, duration: number): void {
  const start = el.scrollLeft;
  const startTime = performance.now();
  const step = (now: number): void => {
    const elapsed = now - startTime;
    const t = Math.min(elapsed / duration, 1);
    el.scrollLeft = start + dx * easeOutQuint(t);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

interface PosterRowProps {
  title: string;
  children: ReactNode;
}

/**
 * Horizontal carousel used on the Library home for "Continue watching",
 * "New releases", "Watchlist". Snaps to tile boundaries on arrow click
 * and only renders the arrows when there's more content to scroll into.
 */
export const PosterRow: FC<PosterRowProps> = ({ title, children }) => {
  const s = usePosterRowStyles();
  const trackRef = useRef<HTMLDivElement>(null);
  const [hasPrev, setHasPrev] = useState(false);
  const [hasNext, setHasNext] = useState(false);

  useEffect(() => {
    const el = trackRef.current;
    if (el === null) return;
    const updateBounds = (): void => {
      setHasPrev(el.scrollLeft > 4);
      setHasNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    };
    updateBounds();
    el.addEventListener("scroll", updateBounds, { passive: true });
    const ro = new ResizeObserver(updateBounds);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", updateBounds);
      ro.disconnect();
    };
  }, [children]);

  const pageSize = (): number => {
    const el = trackRef.current;
    if (el === null) return 0;
    // Page = whole tiles that fit. Aligning the step to a tile-stride
    // means the snap-to-tile boundary has nothing to adjust at rest, so
    // the easing stays clean.
    const tilesPerPage = Math.max(1, Math.floor(el.clientWidth / TILE_STRIDE));
    return tilesPerPage * TILE_STRIDE;
  };

  const goPrev = (): void => {
    const el = trackRef.current;
    if (el === null) return;
    smoothScrollBy(el, -pageSize(), SCROLL_DURATION_MS);
  };

  const goNext = (): void => {
    const el = trackRef.current;
    if (el === null) return;
    smoothScrollBy(el, pageSize(), SCROLL_DURATION_MS);
  };

  return (
    <div className={s.row}>
      <div className={s.header}>{title}</div>
      <div className={s.frame}>
        <div ref={trackRef} className={s.track}>
          {children}
        </div>
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous"
            className={mergeClasses(s.arrow, s.arrowLeft)}
          >
            <IconBack />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Next"
            className={mergeClasses(s.arrow, s.arrowRight)}
          >
            <IconChevron />
          </button>
        )}
      </div>
    </div>
  );
};
