import { makeStyles } from "@griffel/react";
import { tokens } from "../../styles/tokens.js";

export const useAppShellStyles = makeStyles({
  shell: {
    position: "relative",
    width: "100vw",
    height: "100vh",
    backgroundColor: tokens.colorBg0,
    color: tokens.colorText,
    overflowX: "hidden",
    overflowY: "hidden",
  },
  main: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
});
