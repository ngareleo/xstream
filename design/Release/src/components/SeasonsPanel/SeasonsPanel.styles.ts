import { makeStyles } from "@griffel/react";
import { tokens } from "../../styles/tokens.js";

export const useSeasonsPanelStyles = makeStyles({
  panel: {
    display: "flex",
    flexDirection: "column",
    rowGap: "2px",
  },
  panelDense: {
    rowGap: 0,
  },

  season: {
    display: "flex",
    flexDirection: "column",
    backgroundColor: "transparent",
  },

  seasonHeader: {
    display: "grid",
    gridTemplateColumns: "20px 1fr auto auto",
    columnGap: "10px",
    alignItems: "center",
    paddingTop: "8px",
    paddingBottom: "8px",
    paddingLeft: "12px",
    paddingRight: "12px",
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: "1px",
    borderLeftWidth: 0,
    borderBottomStyle: "solid",
    borderBottomColor: tokens.colorBorderSoft,
    cursor: "pointer",
    color: tokens.colorText,
    textAlign: "left",
    transitionProperty: "background-color, color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: "rgba(232, 238, 232, 0.04)",
    },
  },
  seasonHeaderOpen: {
    backgroundColor: "rgba(232, 238, 232, 0.03)",
  },

  chevron: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorTextMuted,
    transitionProperty: "transform, color",
    transitionDuration: tokens.transition,
  },
  chevronOpen: {
    transform: "rotate(90deg)",
    color: tokens.colorGreen,
  },

  seasonLabel: {
    display: "flex",
    flexDirection: "column",
    rowGap: "2px",
    minWidth: 0,
  },
  seasonName: {
    fontFamily: tokens.fontMono,
    fontSize: "11px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    color: tokens.colorText,
  },
  seasonMeta: {
    fontFamily: tokens.fontMono,
    fontSize: "9px",
    letterSpacing: "0.1em",
    color: tokens.colorTextMuted,
  },

  seasonStatus: {
    fontFamily: tokens.fontMono,
    fontSize: "9px",
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: tokens.colorTextDim,
  },
  seasonStatusComplete: {
    color: tokens.colorGreen,
  },
  seasonStatusPartial: {
    color: tokens.colorYellow,
  },
  seasonStatusEmpty: {
    color: tokens.colorTextFaint,
  },

  miniBar: {
    width: "44px",
    height: "3px",
    backgroundColor: tokens.colorBorder,
    borderRadius: "2px",
    overflow: "hidden",
    position: "relative",
  },
  miniFill: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: tokens.colorGreen,
    transitionProperty: "width",
    transitionDuration: tokens.transitionSlow,
  },
  miniFillPartial: {
    backgroundColor: tokens.colorYellow,
  },

  episodes: {
    display: "flex",
    flexDirection: "column",
    paddingTop: "2px",
    paddingBottom: "8px",
  },

  episode: {
    position: "relative",
    display: "grid",
    gridTemplateColumns: "60px 1fr auto auto",
    columnGap: "12px",
    alignItems: "center",
    paddingTop: "6px",
    paddingBottom: "6px",
    paddingLeft: "44px",
    paddingRight: "12px",
    fontFamily: tokens.fontMono,
    fontSize: "11px",
    color: tokens.colorTextDim,
    transitionProperty: "background-color, color",
    transitionDuration: tokens.transition,
    ":hover": {
      backgroundColor: "rgba(232, 238, 232, 0.04)",
      color: tokens.colorText,
    },
  },
  episodeWatched: {
    color: tokens.colorTextMuted,
  },
  episodeWatchedCode: {
    color: tokens.colorTextFaint,
  },
  episodeWatchedTitle: {
    color: tokens.colorTextMuted,
    textDecorationLine: "line-through",
    textDecorationColor: "rgba(154, 166, 160, 0.35)",
    textDecorationThickness: "1px",
  },
  episodeInProgressBar: {
    position: "absolute",
    left: "44px",
    right: "12px",
    bottom: "2px",
    height: "2px",
    backgroundColor: "rgba(232, 238, 232, 0.08)",
    borderRadius: "1px",
    overflow: "hidden",
    pointerEvents: "none",
  },
  episodeInProgressFill: {
    height: "100%",
    backgroundColor: tokens.colorGreen,
    boxShadow: `0 0 6px ${tokens.colorGreenSoft}`,
  },
  episodeMissing: {
    color: tokens.colorTextFaint,
    ":hover": {
      backgroundColor: "transparent",
      color: tokens.colorTextMuted,
    },
  },
  episodeButton: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: "2px",
    borderLeftStyle: "solid",
    borderLeftColor: "transparent",
    cursor: "pointer",
    color: "inherit",
    textAlign: "left",
    width: "100%",
  },
  episodeButtonAvailable: {
    cursor: "pointer",
  },
  episodeButtonDisabled: {
    cursor: "not-allowed",
  },
  episodeActive: {
    borderLeftColor: tokens.colorGreen,
    backgroundColor: tokens.colorGreenSoft,
    color: tokens.colorText,
    ":hover": {
      backgroundColor: tokens.colorGreenSoft,
    },
  },
  episodePlayingMark: {
    fontFamily: tokens.fontMono,
    fontSize: "9px",
    letterSpacing: "0.18em",
    color: tokens.colorGreen,
    textTransform: "uppercase",
    marginRight: "4px",
  },

  episodeCode: {
    fontSize: "10px",
    letterSpacing: "0.08em",
    color: tokens.colorTextMuted,
  },
  episodeTitle: {
    fontFamily: tokens.fontBody,
    fontSize: "12px",
    color: "inherit",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  episodeDuration: {
    fontSize: "10px",
    color: tokens.colorTextMuted,
  },
  episodeStatus: {
    width: "12px",
    height: "12px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  episodeDot: {
    width: "8px",
    height: "8px",
    borderRadius: "999px",
    backgroundColor: tokens.colorGreen,
    boxShadow: `0 0 0 2px ${tokens.colorGreenSoft}`,
  },
  episodeDotMissing: {
    backgroundColor: "transparent",
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "dashed",
    borderRightStyle: "dashed",
    borderBottomStyle: "dashed",
    borderLeftStyle: "dashed",
    borderTopColor: tokens.colorTextFaint,
    borderRightColor: tokens.colorTextFaint,
    borderBottomColor: tokens.colorTextFaint,
    borderLeftColor: tokens.colorTextFaint,
    boxShadow: "none",
  },
  episodeDotInProgress: {
    background: `conic-gradient(${tokens.colorGreen} var(--ep-pct, 0%), rgba(232, 238, 232, 0.18) 0)`,
    boxShadow: `0 0 0 2px ${tokens.colorGreenSoft}`,
  },
  episodeCheck: {
    color: tokens.colorGreen,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  seasonMetaWatched: {
    color: tokens.colorGreen,
    marginLeft: "6px",
  },
});
