import { mergeClasses } from "@griffel/react";
import { type FC, type ReactNode, useEffect, useRef, useState } from "react";

import { TILE_STRIDE } from "~/components/film-tile/FilmTile.styles";
import { IconBack, IconChevron } from "~/lib/icons";

import { strings } from "./PosterRow.strings";
import { usePosterRowStyles } from "./PosterRow.styles";

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

export const PosterRow: FC<PosterRowProps> = ({ title, children }) => {
  const styles = usePosterRowStyles();
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
    <div className={styles.row}>
      <div className={styles.header}>{title}</div>
      <div className={styles.frame}>
        <div ref={trackRef} className={styles.track}>
          {children}
        </div>
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label={strings.prevAriaLabel}
            className={mergeClasses(styles.arrow, styles.arrowLeft)}
          >
            <IconBack />
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label={strings.nextAriaLabel}
            className={mergeClasses(styles.arrow, styles.arrowRight)}
          >
            <IconChevron />
          </button>
        )}
      </div>
    </div>
  );
};
