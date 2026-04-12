import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useDashboardStyles = makeStyles({
  pageRoot: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
  },
  splitBody: {
    display: "grid",
    gridTemplateColumns: "1fr 0px 0px",
    flex: "1",
    minHeight: "0",
    transitionProperty: "grid-template-columns",
    transitionDuration: "0.25s",
    transitionTimingFunction: "ease",
    overflow: "hidden",
  },
  resizeHandle: {
    width: "4px",
    cursor: "col-resize",
    backgroundColor: tokens.colorBorder,
    transitionProperty: "background-color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorRed,
    },
  },
  splitLeft: {
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    minHeight: "0",
    minWidth: "0",
  },
  rightPane: {
    borderLeft: `1px solid ${tokens.colorBorder}`,
    backgroundColor: tokens.colorSurface,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: "0",
    minHeight: "0",
  },
});
