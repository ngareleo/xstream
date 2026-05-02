import { type FC, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { useDevPanelStyles } from "./DevPanel.styles.js";

interface StateLink {
  label: string;
  path: string;
}

interface StateGroup {
  label: string;
  states: StateLink[];
}

const GROUPS: StateGroup[] = [
  {
    label: "Profiles",
    states: [
      { label: "List", path: "/profiles" },
      { label: "Empty", path: "/profiles?empty=1" },
      { label: "New profile", path: "/profiles/new" },
      { label: "Edit profile", path: "/profiles/films-4k/edit" },
    ],
  },
  {
    label: "Library",
    states: [
      { label: "Home", path: "/" },
      { label: "Watchlist", path: "/watchlist" },
    ],
  },
  {
    label: "Player",
    states: [{ label: "Oppenheimer", path: "/player/oppenheimer" }],
  },
  {
    label: "System",
    states: [
      { label: "Settings", path: "/settings" },
      { label: "Design system", path: "/design-system" },
    ],
  },
  {
    label: "Edge cases",
    states: [
      { label: "Error", path: "/error" },
      { label: "404", path: "/this-route-does-not-exist" },
      { label: "Goodbye", path: "/goodbye" },
    ],
  },
];

const STORAGE_KEY = "xstream.designLab.devPanelOpen";

/**
 * Floating jump-to-state panel for the design lab. Lets a designer
 * preview every named state of every page without typing URLs by hand.
 * Persists open/closed across reloads via localStorage.
 */
export const DevPanel: FC = () => {
  const s = useDevPanelStyles();
  const navigate = useNavigate();
  const location = useLocation();
  const here = `${location.pathname}${location.search}`;

  const [open, setOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [open]);

  const goto = (path: string): void => {
    if (path === here) return;
    navigate(path);
  };

  return (
    <div className={s.root}>
      {open && (
        <div className={s.panel} role="dialog" aria-label="Design lab dev panel">
          <div className={s.header}>
            <span className={s.headerTitle}>· Dev · States</span>
            <span className={s.headerHint}>design lab</span>
            <button
              type="button"
              className={s.closeBtn}
              onClick={() => setOpen(false)}
              aria-label="Close dev panel"
            >
              ×
            </button>
          </div>
          <div className={s.list}>
            {GROUPS.map((group) => (
              <div key={group.label} className={s.group}>
                <div className={s.groupLabel}>{group.label}</div>
                {group.states.map((state) => {
                  const active = state.path === here;
                  return (
                    <button
                      key={state.path}
                      type="button"
                      className={mergeClasses(
                        s.entry,
                        active && s.entryActive,
                      )}
                      onClick={() => goto(state.path)}
                    >
                      <span className={s.entryLabel}>{state.label}</span>
                      <span className={s.entryPath}>{state.path}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
      <button
        type="button"
        className={s.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? "Close dev panel" : "Open dev panel"}
      >
        {open ? "× Dev" : "▾ Dev"}
      </button>
    </div>
  );
};
