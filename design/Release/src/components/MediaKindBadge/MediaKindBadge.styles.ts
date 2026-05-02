import { makeStyles } from "@griffel/react";
import { tokens } from "../../styles/tokens.js";

export const useMediaKindBadgeStyles = makeStyles({
  // Shared inline-flex base. Each variant adds its own geometry / chrome.
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  // Tile variant — corner badge floating on top of a poster image.
  // Bordered, blurred backdrop so it stays legible across any poster art.
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

  // Row variant — inline glyph next to a title, no chrome. Used in the
  // 5-col Profiles tree where the discriminator just needs a quick read.
  row: {
    color: tokens.colorTextMuted,
  },
  rowSeries: {
    color: tokens.colorGreen,
  },
});
