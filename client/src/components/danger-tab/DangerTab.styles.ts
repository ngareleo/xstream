import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useDangerTabStyles = makeStyles({
  stack: {
    display: "flex",
    flexDirection: "column",
    rowGap: "16px",
    marginTop: "12px",
  },
  row: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    columnGap: "16px",
    alignItems: "start",
    paddingTop: "12px",
    paddingBottom: "12px",
    borderTop: `1px solid ${tokens.colorBorderSoft}`,
    ":first-child": {
      borderTop: "none",
      paddingTop: 0,
    },
  },
  rowTitle: {
    fontSize: "12px",
    fontWeight: "700",
    color: tokens.colorText,
    marginBottom: "4px",
  },
  rowDesc: {
    fontSize: "11px",
    color: tokens.colorTextMuted,
    lineHeight: "1.6",
  },
  btn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "180px",
    height: "32px",
    padding: "0 14px",
    backgroundColor: "transparent",
    border: `1px solid ${tokens.colorRed}`,
    borderRadius: tokens.radiusSm,
    color: tokens.colorRed,
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    transitionProperty: "background-color, color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: "rgba(255, 93, 108, 0.08)",
    },
    ":disabled": {
      opacity: "0.5",
      cursor: "default",
    },
  },
  // Visual signal that the button is armed and waiting for the second
  // click. Filled background + ink-on-red text so the user can't miss it.
  btnArmed: {
    backgroundColor: tokens.colorRed,
    color: tokens.colorGreenInk,
    ":hover": {
      backgroundColor: tokens.colorRed,
    },
  },
  status: {
    fontSize: "11px",
    color: tokens.colorTextMuted,
    marginTop: "6px",
    fontFamily: tokens.fontMono,
  },
  statusErr: {
    color: tokens.colorRed,
  },
});
