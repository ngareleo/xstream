import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const TILE_WIDTH = 200;
export const TILE_GAP = 16;
export const TILE_STRIDE = TILE_WIDTH + TILE_GAP;

export const useFilmTileStyles = makeStyles({
  tile: {
    flexShrink: 0,
    width: `${TILE_WIDTH}px`,
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingTop: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    paddingRight: 0,
    cursor: "pointer",
    textAlign: "left",
    color: "inherit",
    scrollSnapAlign: "start",
  },
  frame: {
    position: "relative",
    aspectRatio: "2/3",
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
    backgroundColor: tokens.colorSurface,
    transitionProperty: "box-shadow, transform",
    transitionDuration: tokens.transitionSlow,
    "::after": {
      content: '""',
      position: "absolute",
      top: "-1px",
      right: "-1px",
      bottom: "-1px",
      left: "-1px",
      borderTopWidth: "1px",
      borderRightWidth: "1px",
      borderBottomWidth: "1px",
      borderLeftWidth: "1px",
      borderTopStyle: "solid",
      borderRightStyle: "solid",
      borderBottomStyle: "solid",
      borderLeftStyle: "solid",
      borderTopColor: tokens.colorGreen,
      borderRightColor: tokens.colorGreen,
      borderBottomColor: tokens.colorGreen,
      borderLeftColor: tokens.colorGreen,
      clipPath: "inset(100% 0 0 0)",
      transitionProperty: "clip-path",
      transitionDuration: tokens.transitionSlow,
      transitionTimingFunction: "ease-out",
      pointerEvents: "none",
    },
    ":hover": {
      transform: "translateY(-3px)",
      boxShadow: `0 8px 20px ${tokens.colorGreenGlow}, 0 2px 6px ${tokens.colorGreenSoft}`,
    },
    ":hover::after": {
      clipPath: "inset(0 0 0 0)",
    },
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "3px",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  progressFill: {
    height: "100%",
    backgroundColor: tokens.colorGreen,
  },
  meta: {
    marginTop: "10px",
    // Reserve room for two title lines so adjacent tiles align at bottom.
    minHeight: "60px",
  },
  title: {
    fontSize: "13px",
    color: tokens.colorText,
    lineHeight: "1.4",
    // Two-line clamp prevents long titles from pushing subtitle out of alignment.
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    wordBreak: "break-word",
  },
  subtitle: {
    fontSize: "10px",
    color: tokens.colorTextMuted,
    fontFamily: tokens.fontMono,
    letterSpacing: "0.06em",
    marginTop: "3px",
  },
});
