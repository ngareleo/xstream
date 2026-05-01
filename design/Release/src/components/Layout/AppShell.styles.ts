import { makeStyles } from "@griffel/react";
import { tokens } from "../../styles/tokens.js";

export const useAppShellStyles = makeStyles({
  shell: {
    display: "grid",
    gridTemplateColumns: `${tokens.sidebarWidth} 1fr`,
    gridTemplateRows: `${tokens.headerHeight} 1fr`,
    gridTemplateAreas: `"head head" "side main"`,
    width: "100vw",
    height: "100vh",
    backgroundColor: tokens.colorBg0,
    color: tokens.colorText,
    overflow: "hidden",
    position: "relative",
  },
  main: {
    gridArea: "main",
    overflow: "hidden",
    position: "relative",
  },
});
