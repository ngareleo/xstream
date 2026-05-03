import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useLogo02Styles = makeStyles({
  wrap: { textAlign: "center" },
  mark: { marginBottom: 0 },
  markWithWordmark: { marginBottom: "10px" },
  wordmark: {
    fontFamily: tokens.fontMono,
    fontSize: "11px",
    letterSpacing: "0.45em",
    color: tokens.colorTextDim,
    textTransform: "uppercase",
    paddingLeft: "0.45em",
  },
});
