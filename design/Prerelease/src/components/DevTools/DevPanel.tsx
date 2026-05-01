/**
 * DevPanel — floating developer tools overlay.
 *
 * Only rendered when import.meta.env.DEV is true. Exports a no-op stub for
 * production builds so the import can safely live in AppShell.
 *
 * Features:
 *   Kill switch  — force-throw a render error inside any registered component
 *                  tree to exercise the ErrorBoundary without navigating away
 *   Route info   — shows current pathname for quick orientation
 *
 * The panel is toggled by a small "DEV" pill fixed to the bottom-right corner.
 * Press Escape or click outside to close.
 */

import { mergeClasses } from "@griffel/react";
import { type FC, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useDevTools } from "./DevToolsContext.js";
import { useDevPanelStyles } from "./DevPanel.styles.js";

// Pages / component trees that can be force-thrown from the panel.
// Add an entry here whenever you add a new <DevThrowTarget id="..."> in a page.
const THROW_TARGETS = [
  { id: "Dashboard",  label: "Profiles page" },
  { id: "Library",    label: "Library page" },
  { id: "Watchlist",  label: "Watchlist page" },
  { id: "Settings",   label: "Settings page" },
  { id: "Player",     label: "Player page" },
  { id: "NotFound",   label: "404 page" },
];

const DevPanelInner: FC = () => {
  const [open, setOpen] = useState(false);
  const { requestThrow } = useDevTools();
  const { pathname } = useLocation();
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleThrow = (id: string) => {
    setOpen(false);
    // Small delay so the panel closes before the throw renders
    setTimeout(() => requestThrow(id), 50);
  };

  const styles = useDevPanelStyles();

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
                >
                  ⚡ Throw
                </button>
              </div>
            ))}
          </div>

          <div className={styles.footer}>
            Errors are caught by the nearest{" "}
            <code className={styles.footerCode}>&lt;ErrorBoundary&gt;</code>. Click "Try again" to recover.
          </div>
        </div>
      )}

      <button
        className={mergeClasses(styles.pill, open && styles.pillActive)}
        onClick={() => setOpen((o) => !o)}
        title="Toggle DevTools panel"
      >
        DEV
      </button>
    </div>
  );
};

// Export a no-op in production so the import in AppShell compiles but ships nothing
export const DevPanel: FC = import.meta.env.DEV ? DevPanelInner : () => null;
