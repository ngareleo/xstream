/**
 * useSplitResize — drag-to-resize hook for the split-body layout.
 *
 * The split-body always has 3 CSS columns (1fr | handle | right-pane) so that
 * the column count never changes and the open/close CSS transition works cleanly.
 * When closed: `1fr 0px 0px`. When open: `1fr 4px ${paneWidth}px`.
 *
 * During drag the hook:
 *   1. Adds `.is-resizing` to the split-body (suppresses CSS transition so the
 *      pane tracks the pointer without a 0.25s lag on every mousemove).
 *   2. Adds `body.resizing` (enforces col-resize cursor globally).
 *   3. Removes both classes on mouseup.
 *
 * Usage:
 *   const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize();
 *
 *   <div
 *     ref={containerRef}
 *     className={`split-body${paneOpen ? " pane-open" : ""}`}
 *     style={paneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
 *   >
 *     <div className="split-left">...</div>
 *     {paneOpen && (
 *       <div className="split-resize-handle" onMouseDown={onResizeMouseDown} />
 *     )}
 *     <div className="right-pane">...</div>
 *   </div>
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
  // Ref tracks the live value so the stable mousedown handler always reads the
  // latest width without needing to re-create the handler on every state update.
  const paneWidthRef = useRef(defaultWidth);
  const containerRef = useRef<HTMLDivElement>(null);

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();

    const startX     = e.clientX;
    const startWidth = paneWidthRef.current;

    // Suppress the CSS transition during drag and lock the cursor globally.
    containerRef.current?.classList.add("is-resizing");
    document.body.classList.add("resizing");

    const onMouseMove = (ev: MouseEvent) => {
      // Dragging left widens the right pane; dragging right narrows it.
      const delta    = startX - ev.clientX;
      const newWidth = Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, startWidth + delta));
      paneWidthRef.current = newWidth;
      setPaneWidth(newWidth);
    };

    const onMouseUp = () => {
      containerRef.current?.classList.remove("is-resizing");
      document.body.classList.remove("resizing");
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup",   onMouseUp);
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);
  }, []); // stable — captures nothing from render scope

  return { paneWidth, containerRef, onResizeMouseDown };
}
