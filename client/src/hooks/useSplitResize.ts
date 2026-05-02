/**
 * useSplitResize — drag-to-resize hook for the split-body layout.
 *
 * The split-body always has 3 CSS columns (1fr | handle | right-pane) so that
 * the column count never changes and the open/close CSS transition works cleanly.
 * When closed: `1fr 0px 0px`. When open: `1fr 4px ${paneWidth}px`.
 *
 * During drag the hook:
 *   1. Disables the CSS transition on the container so the pane tracks the
 *      pointer without a 0.25s lag on every mousemove.
 *   2. Sets col-resize cursor on <html> and disables text selection on <body>.
 *   3. Restores both on mouseup.
 *
 * Usage:
 *   const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize();
 *
 *   <div
 *     ref={containerRef}
 *     style={paneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
 *   >
 *     <div>...left...</div>
 *     {paneOpen && <div onMouseDown={onResizeMouseDown} />}
 *     <div>...right...</div>
 *   </div>
 */

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
  // Ref tracks the live value so the stable mousedown handler always reads the
  // latest width without needing to re-create the handler on every state update.
  const paneWidthRef = useRef(defaultWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const startX = e.clientX;
    const startWidth = paneWidthRef.current;

    // Suppress transition during drag so the pane tracks the pointer instantly.
    if (containerRef.current) containerRef.current.style.transition = "none";
    // Lock cursor globally so it stays col-resize even when hovering other elements.
    document.documentElement.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const onMouseMove = (ev: MouseEvent) => {
      // Dragging left widens the right pane; dragging right narrows it.
      const delta = startX - ev.clientX;
      // Also cap so the left column never drops below MIN_LEFT_WIDTH.
      const containerWidth = containerRef.current?.offsetWidth ?? Infinity;
      const maxByContainer = containerWidth - MIN_LEFT_WIDTH - 4; // 4px handle
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
  }, []); // stable — captures nothing from render scope

  return { paneWidth, containerRef, onResizeMouseDown };
}
