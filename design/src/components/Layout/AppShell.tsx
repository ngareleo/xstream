import { type FC, type ReactNode, useState } from "react";
import { Sidebar } from "../Sidebar/Sidebar.js";

interface AppShellProps {
  children: ReactNode;
}

/**
 * AppShell provides the CSS grid: header (row 1 full-width), sidebar (row 2 col 1),
 * main (row 2 col 2). Each page renders <AppHeader> + <div.main> as direct children
 * of this shell so they land in the correct grid areas.
 */
export const AppShell: FC<AppShellProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className={`app-shell${collapsed ? " nav-collapsed" : ""}`}>
      {children}
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
    </div>
  );
};
