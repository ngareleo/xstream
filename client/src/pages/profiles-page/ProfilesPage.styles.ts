import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useProfilesPageStyles = makeStyles({
  splitBody: {
    display: "grid",
    gridTemplateColumns: "1fr 0px 0px",
    height: "100%",
    paddingTop: tokens.headerHeight,
    boxSizing: "border-box",
    transitionProperty: "grid-template-columns",
    transitionDuration: tokens.transitionSlow,
    transitionTimingFunction: "ease",
  },
  splitBodyOpen: {},
  resizeHandle: {
    backgroundColor: tokens.colorBorder,
    cursor: "col-resize",
    transitionProperty: "background-color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: tokens.colorGreen,
    },
  },
});
