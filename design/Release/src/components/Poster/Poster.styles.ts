import { makeStyles } from "@griffel/react";
import { tokens } from "../../styles/tokens.js";

export const usePosterStyles = makeStyles({
  image: {
    objectFit: "cover",
    display: "block",
  },
  placeholder: {
    background: `linear-gradient(160deg, ${tokens.colorSurface2}, ${tokens.colorBg0})`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: tokens.colorTextFaint,
    fontFamily: tokens.fontMono,
    fontSize: "10px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
  },
});
