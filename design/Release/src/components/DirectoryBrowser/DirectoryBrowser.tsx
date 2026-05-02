import { type FC, Fragment, useMemo, useState } from "react";
import { mergeClasses } from "@griffel/react";
import { IconFolder } from "../../lib/icons.js";
import { listDirectory, parentPath } from "./mockFs.js";
import { useDirectoryBrowserStyles } from "./DirectoryBrowser.styles.js";

interface DirectoryBrowserProps {
  initialPath?: string;
  onCancel: () => void;
  onSelect: (path: string) => void;
}

/**
 * Offline directory picker for the design lab. Mirrors the production
 * `client/src/components/directory-browser/DirectoryBrowser.tsx` shape:
 * a breadcrumb at the top, a scrollable list of children, and a footer
 * with Cancel + Select-this-folder text actions.
 */
export const DirectoryBrowser: FC<DirectoryBrowserProps> = ({
  initialPath = "/",
  onCancel,
  onSelect,
}) => {
  const s = useDirectoryBrowserStyles();
  const [path, setPath] = useState<string>(initialPath || "/");
  const entries = useMemo(() => listDirectory(path), [path]);

  const crumbs = useMemo(() => {
    if (path === "/" || path === "") return [{ label: "/", path: "/" }];
    const parts = path.split("/").filter(Boolean);
    const out: { label: string; path: string }[] = [{ label: "/", path: "/" }];
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      out.push({ label: part, path: acc });
    }
    return out;
  }, [path]);

  return (
    <div className={s.panel} role="dialog" aria-label="Choose a folder">
      <div className={s.breadcrumb}>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <Fragment key={c.path}>
              {i > 0 && <span className={s.crumbSep}>/</span>}
              <button
                type="button"
                className={mergeClasses(s.crumbBtn, last && s.crumbCurrent)}
                onClick={() => setPath(c.path)}
              >
                {c.label}
              </button>
            </Fragment>
          );
        })}
      </div>

      <div className={s.list}>
        {path !== "/" && (
          <button
            type="button"
            className={mergeClasses(s.entry, s.entryUp)}
            onClick={() => setPath(parentPath(path))}
          >
            <span className={s.entryIcon}>↑</span> .. (up)
          </button>
        )}
        {entries.length === 0 ? (
          <div className={s.empty}>This folder is empty.</div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.path}
              type="button"
              className={s.entry}
              onClick={() => setPath(entry.path)}
            >
              <span className={s.entryIcon}>
                <IconFolder />
              </span>
              {entry.name}
            </button>
          ))
        )}
      </div>

      <div className={s.actions}>
        <span className={s.actionsHint} title={path}>
          {path}
        </span>
        <button type="button" className={s.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={s.selectBtn}
          onClick={() => onSelect(path)}
        >
          Select
        </button>
      </div>
    </div>
  );
};
