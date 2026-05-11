import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useAccountTabStyles = makeStyles({
  email: {
    fontSize: "13px",
    color: tokens.colorText,
    fontFamily: tokens.fontMono,
  },
  fieldStack: {
    display: "flex",
    flexDirection: "column",
    rowGap: "12px",
  },
  errorMsg: {
    fontSize: "11px",
    color: tokens.colorRed,
    marginTop: "6px",
  },
  signOutZone: {
    marginTop: "24px",
    paddingTop: "16px",
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: tokens.colorBorderSoft,
  },
  signOutBtn: {
    display: "inline-flex",
    alignItems: "center",
    padding: "8px 16px",
    backgroundColor: "transparent",
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: tokens.colorBorder,
    borderRightColor: tokens.colorBorder,
    borderBottomColor: tokens.colorBorder,
    borderLeftColor: tokens.colorBorder,
    borderRadius: tokens.radiusSm,
    color: tokens.colorTextMuted,
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "10px",
    transitionProperty: "color, border-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorText,
      borderTopColor: tokens.colorTextFaint,
      borderRightColor: tokens.colorTextFaint,
      borderBottomColor: tokens.colorTextFaint,
      borderLeftColor: tokens.colorTextFaint,
    },
  },
});
