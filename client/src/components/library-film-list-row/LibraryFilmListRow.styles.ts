import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens";

export const useLibraryFilmListRowStyles = makeStyles({
  listRow: {
    display: "grid",
    gridTemplateColumns: "48px 1fr 110px 60px 72px 64px",
    gap: "0 12px",
    alignItems: "center",
    padding: "6px 10px",
    borderRadius: tokens.radiusSm,
    cursor: "pointer",
    transitionProperty: "background",
    transitionDuration: tokens.transition,
    borderBottom: "1px solid transparent",
    ":hover": {
      backgroundColor: "rgba(255,255,255,0.04)",
    },
  },
  listRowSelected: {
    backgroundColor: "rgba(206,17,38,0.07)",
    borderBottomColor: "rgba(206,17,38,0.15)",
  },
  listThumb: {
    width: "48px",
    height: "68px",
    borderRadius: "3px",
    flexShrink: "0",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundColor: tokens.colorSurface2,
  },
  listInfo: {
    minWidth: "0",
  },
  listTitle: {
    fontSize: "13px",
    fontWeight: "500",
    color: "rgba(245,245,245,0.85)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  listMeta: {
    fontSize: "11px",
    color: tokens.colorMuted,
    marginTop: "2px",
  },
  listCell: {
    fontSize: "11px",
    color: tokens.colorMuted2,
    whiteSpace: "nowrap",
    textAlign: "right",
  },
});
