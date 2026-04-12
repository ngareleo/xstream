import { mergeClasses } from "@griffel/react";
import { type FC, type ReactNode, useState } from "react";
import { Sidebar } from "../Sidebar/Sidebar.js";
import { LoadingBar } from "../LoadingBar/LoadingBar.js";
import { LoadingBarProvider } from "../LoadingBar/LoadingBarContext.js";
import { DevPanel } from "../DevTools/DevPanel.js";
import { DevToolsProvider } from "../DevTools/DevToolsContext.js";
import { useAppShellStyles } from "./AppShell.styles.js";

interface AppShellProps {
  children: ReactNode;
}

/**
 * AppShell provides the CSS grid: header (row 1 full-width), sidebar (row 2 col 1),
 * main (row 2 col 2). Each page renders <AppHeader> + <div.main> as direct children
 * of this shell so they land in the correct grid areas.
 *
 * Also owns the LoadingBar (global top-of-viewport progress indicator) and the
 * DevPanel (dev-only floating kill-switch overlay).
 */
export const AppShell: FC<AppShellProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const styles = useAppShellStyles();

  return (
    <DevToolsProvider>
      <LoadingBarProvider>
        <LoadingBar />
        <div className={mergeClasses(styles.root, collapsed && styles.rootCollapsed)}>
          {children}
          <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        </div>
        <DevPanel />
      </LoadingBarProvider>
    </DevToolsProvider>
  );
};
