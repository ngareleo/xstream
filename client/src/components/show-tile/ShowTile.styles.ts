import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const TILE_WIDTH = 200;

// Shares FilmTile visual contract; no per-tile progress bar (per-episode; see detail overlay).
export const useShowTileStyles = makeStyles({
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
    ":hover": {
      transform: "translateY(-3px)",
      boxShadow: `0 8px 20px ${tokens.colorGreenGlow}, 0 2px 6px ${tokens.colorGreenSoft}`,
    },
  },
  image: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  meta: {
    marginTop: "10px",
    minHeight: "60px",
  },
  title: {
    fontSize: "13px",
    color: tokens.colorText,
    lineHeight: "1.4",
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
