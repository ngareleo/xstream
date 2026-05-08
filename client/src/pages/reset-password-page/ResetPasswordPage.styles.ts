import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useResetPasswordStyles = makeStyles({
  backRow: {
    display: "flex",
    justifyContent: "center",
    marginTop: "8px",
  },
  sentActions: {
    display: "flex",
    flexDirection: "column",
    rowGap: "12px",
    marginTop: "8px",
  },
  resendBtn: {
    backgroundColor: "transparent",
    color: tokens.colorTextDim,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    fontFamily: tokens.fontMono,
    fontSize: "11px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    cursor: "pointer",
    paddingTop: "8px",
    paddingBottom: "8px",
    transitionProperty: "color",
    transitionDuration: tokens.transition,
    ":hover": { color: tokens.colorText },
  },
});
