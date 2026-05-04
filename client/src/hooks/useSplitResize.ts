/** Drag-to-resize hook for split-body layout. See docs/client/Components/README.md for usage. */

import type React from "react";
import { useCallback, useRef, useState } from "react";

const MIN_PANE_WIDTH = 240;
const MAX_PANE_WIDTH = 1200;
const MIN_LEFT_WIDTH = 280;
const STORAGE_KEY = "xstream:pane-width";

export interface SplitResizeResult {
  paneWidth: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onResizeMouseDown: (e: React.MouseEvent) => void;
}

export function useSplitResize(defaultWidth = 360): SplitResizeResult {
  const [paneWidth, setPaneWidth] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = Number(stored);
      if (!Number.isNaN(parsed)) {
        return Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, parsed));
      }
    }
    return defaultWidth;
  });
  // Ref tracks live value so mousedown handler reads latest width without re-creation.
  const paneWidthRef = useRef(defaultWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = paneWidthRef.current;

    // Suppress transition to track pointer instantly; lock cursor globally.
    if (containerRef.current) containerRef.current.style.transition = "none";
    document.documentElement.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      const delta = startX - ev.clientX;
      // Cap so left column never drops below MIN_LEFT_WIDTH.
      const containerWidth = containerRef.current?.offsetWidth ?? Infinity;
      const maxByContainer = containerWidth - MIN_LEFT_WIDTH - 4;
      const newWidth = Math.max(
        MIN_PANE_WIDTH,
        Math.min(MAX_PANE_WIDTH, maxByContainer, startWidth + delta)
      );
      paneWidthRef.current = newWidth;
      setPaneWidth(newWidth);
    };

    const onMouseUp = () => {
      if (containerRef.current) containerRef.current.style.transition = "";
      document.documentElement.style.cursor = "";
      document.body.style.userSelect = "";
      localStorage.setItem(STORAGE_KEY, String(paneWidthRef.current));
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }, []);

  return { paneWidth, containerRef, onResizeMouseDown };
}
