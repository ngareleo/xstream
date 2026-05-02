import { type FC } from "react";
import { Link } from "react-router-dom";
import { makeStyles } from "@griffel/react";
import { tokens } from "../../styles/tokens.js";

/**
 * Visual mockup for an unexpected runtime failure. Linked from the
 * design-lab DevPanel under "Error" — there is no actual thrown error
 * here, just the recovery surface so a designer can iterate on it.
 */
export const ErrorPage: FC = () => {
  const s = useStyles();
  return (
    <div className={s.root}>
      <div className={s.watermark}>error</div>
      <div className={s.content}>
        <div className={s.eyebrow}>· runtime fault · trace 7c2a-0b13</div>
        <div className={s.headline}>
          <span className={s.headlineWhite}>something</span>
          <span className={s.headlineAccent}>went sideways.</span>
        </div>
        <div className={s.rule} />
        <p className={s.body}>
          The renderer tripped while preparing this view. Logs were captured
          and the player is unaffected — try the page again, or jump back to
          your library.
        </p>
        <pre className={s.stack}>
          {`TypeError: Cannot read properties of undefined (reading 'profile')
    at FilmRow.render (Profiles.tsx:212:18)
    at renderWithHooks (react-dom.development.js:14803:18)
    at updateFunctionComponent (react-dom.development.js:17034:20)`}
        </pre>
        <div className={s.actions}>
          <Link to="/" className={s.cta}>
            ← back to library
          </Link>
          <button
            type="button"
            className={s.ctaMuted}
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
};

const useStyles = makeStyles({
  root: {
    position: "relative",
    flexGrow: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: "80px",
    paddingTop: tokens.headerHeight,
    boxSizing: "border-box",
    overflow: "hidden",
    backgroundImage:
      "radial-gradient(circle, rgba(255,93,108,0.05) 1px, transparent 1px)",
    backgroundSize: "28px 28px",
    minHeight: "100vh",
  },
  watermark: {
    position: "absolute",
    bottom: "-60px",
    right: "-60px",
    fontFamily: tokens.fontHead,
    fontSize: "340px",
    lineHeight: "1",
    letterSpacing: "-0.02em",
    color: "rgba(255, 93, 108, 0.04)",
    pointerEvents: "none",
    userSelect: "none",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
  },
  content: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexDirection: "column",
    rowGap: "20px",
    maxWidth: "640px",
  },
  eyebrow: {
    fontFamily: tokens.fontMono,
    fontSize: "10px",
    letterSpacing: "0.22em",
    color: tokens.colorRed,
    textTransform: "uppercase",
  },
  headline: {
    display: "flex",
    flexDirection: "column",
    fontFamily: tokens.fontHead,
    fontSize: "96px",
    lineHeight: "0.9",
    letterSpacing: "0.01em",
    textTransform: "uppercase",
  },
  headlineWhite: { color: tokens.colorText },
  headlineAccent: { color: tokens.colorRed },
  rule: {
    width: "56px",
    height: "3px",
    backgroundColor: tokens.colorRed,
    borderRadius: "2px",
  },
  body: {
    fontSize: "14px",
    lineHeight: "1.65",
    color: tokens.colorTextDim,
    maxWidth: "480px",
    margin: 0,
    fontFamily: tokens.fontBody,
  },
  stack: {
    fontFamily: tokens.fontMono,
    fontSize: "11px",
    lineHeight: "1.55",
    color: tokens.colorTextDim,
    backgroundColor: tokens.colorSurface,
    paddingTop: "12px",
    paddingBottom: "12px",
    paddingLeft: "16px",
    paddingRight: "16px",
    borderTopWidth: "1px",
    borderRightWidth: "1px",
    borderBottomWidth: "1px",
    borderLeftWidth: "1px",
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: tokens.colorBorderSoft,
    borderRightColor: tokens.colorBorderSoft,
    borderBottomColor: tokens.colorBorderSoft,
    borderLeftColor: tokens.colorBorderSoft,
    borderRadius: tokens.radiusSm,
    overflowX: "auto",
    margin: 0,
    whiteSpace: "pre",
  },
  actions: {
    display: "flex",
    columnGap: "20px",
    marginTop: "8px",
  },
  cta: {
    color: tokens.colorRed,
    fontFamily: tokens.fontMono,
    fontSize: "12px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    textDecorationLine: "underline",
    textDecorationColor: tokens.colorRed,
    textDecorationThickness: "1px",
    textUnderlineOffset: "5px",
    transitionProperty: "color, text-decoration-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorText,
      textDecorationColor: tokens.colorText,
    },
  },
  ctaMuted: {
    backgroundColor: "transparent",
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    paddingTop: 0,
    paddingBottom: "3px",
    paddingLeft: 0,
    paddingRight: 0,
    color: tokens.colorTextDim,
    fontFamily: tokens.fontMono,
    fontSize: "12px",
    letterSpacing: "0.18em",
    textTransform: "uppercase",
    textDecorationLine: "underline",
    textDecorationColor: "rgba(232, 238, 232, 0.35)",
    textDecorationThickness: "1px",
    textUnderlineOffset: "5px",
    cursor: "pointer",
    transitionProperty: "color, text-decoration-color",
    transitionDuration: tokens.transition,
    ":hover": {
      color: tokens.colorText,
      textDecorationColor: tokens.colorText,
    },
  },
});
