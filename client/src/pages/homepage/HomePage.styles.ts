import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useHomePageStyles = makeStyles({
  page: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflowX: "hidden",
    overflowY: "auto",
    backgroundColor: tokens.colorBg0,
    paddingLeft: "40px",
    paddingRight: "40px",
  },
});
