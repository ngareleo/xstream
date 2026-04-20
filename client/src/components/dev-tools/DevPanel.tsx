/**
 * DevPanel — floating developer tools overlay.
 *
 * Only rendered in development (process.env.NODE_ENV !== "production").
 * Exports a no-op stub for production builds so the import in AppShell
 * ships nothing to users.
 *
 * Features:
 *   Kill switch — force-throw a render error inside any registered
 *                 <DevThrowTarget id="..."> to exercise ErrorBoundary
 *                 without navigating away.
 *   Route info  — shows current pathname for quick orientation.
 *
 * Toggle with the "DEV" pill fixed to the bottom-right corner.
 * Press Escape or click outside to close.
 */

import { mergeClasses } from "@griffel/react";
import { type FC, useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

import { useDevPanelStyles } from "./DevPanel.styles.js";
import { useDevTools } from "./DevToolsContext.js";

// Pages / component trees that can be force-thrown from the panel.
// Add an entry whenever you wrap a page in <DevThrowTarget id="...">.
const THROW_TARGETS = [
  { id: "Dashboard", label: "Dashboard page" },
  { id: "Library", label: "Library page" },
  { id: "Player", label: "Player page" },
  { id: "NotFound", label: "404 page" },
];

export const DevPanelInner: FC = () => {
  const [open, setOpen] = useState(false);
  const { setThrowTarget } = useDevTools();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);
  const styles = useDevPanelStyles();

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent): void => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleThrow = useCallback(
    (id: string): void => {
      setOpen(false);
      setTimeout(() => setThrowTarget(id), 50);
    },
    [setThrowTarget]
  );

  return (
    <div className={styles.root} ref={panelRef}>
      {open && (
        <div className={styles.popup}>
          <div className={styles.header}>
            <span className={styles.title}>DevTools</span>
            <span className={styles.route}>{pathname}</span>
          </div>

          <div className={styles.sectionLabel}>Kill switch — force throw</div>
          <div className={styles.targets}>
            {THROW_TARGETS.map(({ id, label }) => (
              <div key={id} className={styles.targetRow}>
                <div>
                  <div className={styles.targetLabel}>{label}</div>
                  <div className={styles.targetId}>{id}</div>
                </div>
                <button
                  className={styles.throwBtn}
                  onClick={() => handleThrow(id)}
                  title={`Throw error inside <DevThrowTarget id="${id}">`}
                  type="button"
                >
                  ⚡ Throw
                </button>
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            Errors are caught by the nearest{" "}
            <code className={styles.footerCode}>&lt;ErrorBoundary&gt;</code>. Click &quot;Try
            again&quot; to recover.
          </div>
        </div>
      )}

      <button
        className={mergeClasses(styles.pill, open && styles.pillActive)}
        onClick={() => setOpen((o) => !o)}
        title="Toggle DevTools panel"
        type="button"
      >
        DEV
      </button>
    </div>
  );
};

// DevPanelInner is the named export consumed by DevPanelAsync for code-splitting.
