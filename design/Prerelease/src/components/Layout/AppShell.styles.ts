import { makeStyles } from "@griffel/react";

import { tokens } from "../../styles/tokens.js";

export const useAppShellStyles = makeStyles({
  root: {
    display: "grid",
    gridTemplateRows: `${tokens.headerHeight} 1fr`,
    gridTemplateColumns: `${tokens.sidebarWidth} 1fr`,
    gridTemplateAreas: '"header header" "sidebar main"',
    height: "100vh",
    overflow: "hidden",
    transitionProperty: "grid-template-columns",
    transitionDuration: "0.22s",
    transitionTimingFunction: "ease",
  },
  rootCollapsed: {
    gridTemplateColumns: `${tokens.sidebarCollapsedWidth} 1fr`,
  },
  main: {
    gridArea: "main",
    display: "flex",
    flexDirection: "column",
    minHeight: "0",
    overflow: "hidden",
  },
});
