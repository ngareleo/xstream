/**
 * useSplitResize — drag-to-resize hook for the split-body layout.
 *
 * Verbatim port from `design/Prerelease/src/hooks/useSplitResize.ts`.
 * Same contract: 3-column grid (1fr | handle | pane). When closed:
 * `1fr 0px 0px`. When open: `1fr 4px ${paneWidth}px`.
 */

import React, { useCallback, useRef, useState } from "react";

const MIN_PANE_WIDTH = 240;
const MAX_PANE_WIDTH = 640;

export interface SplitResizeResult {
  paneWidth: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onResizeMouseDown: (e: React.MouseEvent) => void;
}

export function useSplitResize(defaultWidth = 360): SplitResizeResult {
  const [paneWidth, setPaneWidth] = useState(defaultWidth);
  const paneWidthRef = useRef(defaultWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = paneWidthRef.current;

    containerRef.current?.classList.add("is-resizing");
    document.body.classList.add("resizing");

    const onMouseMove = (ev: MouseEvent): void => {
      const delta = startX - ev.clientX;
      const newWidth = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, startWidth + delta));
      paneWidthRef.current = newWidth;
      setPaneWidth(newWidth);
    };

    const onMouseUp = (): void => {
      containerRef.current?.classList.remove("is-resizing");
      document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return { paneWidth, containerRef, onResizeMouseDown };
}
