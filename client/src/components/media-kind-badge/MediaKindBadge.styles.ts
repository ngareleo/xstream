import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useMediaKindBadgeStyles = makeStyles({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  tile: {
    position: "absolute",
    top: "6px",
    left: "6px",
    width: "22px",
    height: "22px",
    color: tokens.colorText,
    backgroundColor: "rgba(5, 7, 6, 0.62)",
    backdropFilter: "blur(4px)",
    borderRadius: tokens.radiusSm,
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
    pointerEvents: "none",
  },
  tileSeries: {
    color: tokens.colorGreen,
    borderTopColor: tokens.colorGreen,
    borderRightColor: tokens.colorGreen,
    borderBottomColor: tokens.colorGreen,
    borderLeftColor: tokens.colorGreen,
  },

  row: {
    color: tokens.colorTextMuted,
  },
  rowSeries: {
    color: tokens.colorGreen,
  },
});
