import { makeStyles } from "@griffel/react";

import { tokens } from "~/styles/tokens.js";

export const useSignUpStyles = makeStyles({
  helperText: {
    fontFamily: tokens.fontBody,
    fontSize: "12px",
    color: tokens.colorTextDim,
  },
});
