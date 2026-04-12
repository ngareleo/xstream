import { mergeClasses } from "@griffel/react";
import { createContext, type FC, type ReactNode, useContext, useEffect, useState } from "react";

import { AppHeader } from "~/components/app-header/AppHeader.js";
import { DevPanelAsync } from "~/components/dev-tools/DevPanelAsync.js";
import { DevToolsProvider } from "~/components/dev-tools/DevToolsContext.js";
import { LoadingBar } from "~/components/loading-bar/LoadingBar.js";
import {
  LoadingBarProvider,
  RouterNavigationLoader,
} from "~/components/loading-bar/LoadingBarContext.js";
import { Sidebar } from "~/components/sidebar/Sidebar.js";

import { useAppShellStyles } from "./AppShell.styles.js";

// ─── Libraries context ────────────────────────────────────────────────────────
// Pages that have library data push it here so the Sidebar ProfileMenu can
// show real library names without running its own Relay query.

export interface LibraryInfo {
  id: string;
  name: string;
  fileCount: number;
}

const LibrariesContext = createContext<LibraryInfo[]>([]);
const SetLibrariesContext = createContext<(libs: LibraryInfo[]) => void>(() => {});

export function useLibraries(): LibraryInfo[] {
  return useContext(LibrariesContext);
}

export function useProvideLibraries(libs: LibraryInfo[]): void {
  const set = useContext(SetLibrariesContext);
  useEffect(() => {
    set(libs);
  }, [libs, set]);
}

// ─── Header actions slot ──────────────────────────────────────────────────────
// Pages inject action buttons into the header by calling useHeaderActions().
// AppShell holds the state; AppHeader renders whatever is set.

interface HeaderActionsCtx {
  actions: ReactNode;
  setActions: (node: ReactNode) => void;
}

const HeaderActionsContext = createContext<HeaderActionsCtx>({
  actions: null,
  setActions: () => {},
});

export function useHeaderActions(): (node: ReactNode) => void {
  return useContext(HeaderActionsContext).setActions;
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: ReactNode;
}

/**
 * AppShell provides the CSS grid: header (row 1, full-width), sidebar (row 2
 * col 1), main (row 2 col 2). Each page renders a page-specific header slot +
 * <div className={styles.main}> as children.
 */
export const AppShell: FC<AppShellProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [actions, setActions] = useState<ReactNode>(null);
  const [libraries, setLibraries] = useState<LibraryInfo[]>([]);
  const styles = useAppShellStyles();

  return (
    <DevToolsProvider>
      <LoadingBarProvider>
        <SetLibrariesContext.Provider value={setLibraries}>
          <LibrariesContext.Provider value={libraries}>
            <HeaderActionsContext.Provider value={{ actions, setActions }}>
              <div className={mergeClasses(styles.root, collapsed && styles.rootCollapsed)}>
                <RouterNavigationLoader />
                <LoadingBar />
                <AppHeader actions={actions} />
                <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
                <div className={styles.main}>{children}</div>
              </div>
              <DevPanelAsync />
            </HeaderActionsContext.Provider>
          </LibrariesContext.Provider>
        </SetLibrariesContext.Provider>
      </LoadingBarProvider>
    </DevToolsProvider>
  );
};
