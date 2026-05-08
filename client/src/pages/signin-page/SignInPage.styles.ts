import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useSignInStyles = makeStyles({
  forgotRow: {
    display: "flex",
    justifyContent: "flex-end",
    marginTop: "-4px",
  },
  helperText: {
    fontFamily: tokens.fontBody,
    fontSize: "12px",
    color: tokens.colorTextDim,
  },
});
