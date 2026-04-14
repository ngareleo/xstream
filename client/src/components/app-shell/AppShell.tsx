import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import {
  createContext,
  type FC,
  type ReactNode,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { AppHeader } from "~/components/app-header/AppHeader.js";
import { DevPanelAsync } from "~/components/dev-tools/DevPanelAsync.js";
import { DevToolsProvider } from "~/components/dev-tools/DevToolsContext.js";
import { LoadingBar } from "~/components/loading-bar/LoadingBar.js";
import { LoadingBarProvider } from "~/components/loading-bar/LoadingBarContext.js";
import { RouterNavigationLoader } from "~/components/router-navigation-loader/RouterNavigationLoader.js";
import { isSidebarToggledEvent } from "~/components/sidebar/Sidebar.events.js";
import { SidebarAsync } from "~/components/sidebar/SidebarAsync.js";
import { StreamingLogOverlayAsync } from "~/components/stream-log-overlay/StreamingLogOverlayAsync.js";

import { useAppShellStyles } from "./AppShell.styles.js";

// ─── Libraries context ────────────────────────────────────────────────────────
// Pages that have library data push it here so the Sidebar ProfileMenu can
// show real library names without running its own Relay query.

export interface LibraryInfo {
  id: string;
  name: string;
  fileCount: number;
}

interface LibrariesCtx {
  libraries: LibraryInfo[];
  setLibraries: (libs: LibraryInfo[]) => void;
}

const LibrariesContext = createContext<LibrariesCtx>({
  libraries: [],
  setLibraries: () => {},
});

export function useLibraries(): LibraryInfo[] {
  return useContext(LibrariesContext).libraries;
}

export function useProvideLibraries(libs: LibraryInfo[]): void {
  const { setLibraries } = useContext(LibrariesContext);
  useEffect(() => {
    setLibraries(libs);
  }, [libs, setLibraries]);
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
  const librariesCtx = useMemo<LibrariesCtx>(() => ({ libraries, setLibraries }), [libraries]);
  const styles = useAppShellStyles();

  const sidebarInterceptor = useCallback(
    async (wrapper: EventWrapper): Promise<EventWrapper | undefined> => {
      if (isSidebarToggledEvent(wrapper)) {
        setCollapsed((c) => !c);
        return undefined;
      }
      return wrapper;
    },
    []
  );

  return (
    <DevToolsProvider>
      <LoadingBarProvider>
        <LibrariesContext.Provider value={librariesCtx}>
          <HeaderActionsContext.Provider value={{ actions, setActions }}>
            <div className={mergeClasses(styles.root, collapsed && styles.rootCollapsed)}>
              <RouterNavigationLoader />
              <LoadingBar />
              <AppHeader actions={actions} />
              <NovaEventingInterceptor interceptor={sidebarInterceptor}>
                <Suspense fallback={null}>
                  <SidebarAsync collapsed={collapsed} />
                </Suspense>
              </NovaEventingInterceptor>
              <div className={styles.main}>{children}</div>
            </div>
            <DevPanelAsync />
            <StreamingLogOverlayAsync />
          </HeaderActionsContext.Provider>
        </LibrariesContext.Provider>
      </LoadingBarProvider>
    </DevToolsProvider>
  );
};
