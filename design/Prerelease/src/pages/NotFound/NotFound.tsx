/**
 * NotFound — 404 page
 *
 * Rendered by the catch-all route inside AppShell. Shows a styled 404 with
 * navigation back into the app. The atmospheric treatment (grain + radial
 * gradient) matches the Player's idle overlay so the error state feels like
 * part of the same design language rather than a default browser screen.
 */

import { mergeClasses } from "@griffel/react";
import { type FC } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { IconArrowLeft, IconSearch } from "../../lib/icons.js";
import { useNotFoundStyles } from "./NotFound.styles.js";

export const NotFound: FC = () => {
  const navigate = useNavigate();
  const s = useNotFoundStyles();

  return (
    <>
      <AppHeader collapsed={false} />

      <div className="main">
        <div className={s.root}>
          <div className={s.bg} />
          <div className={s.grain} />

          <div className={s.body}>
            <div className={s.code}>404</div>
            <div className={s.title}>Page not found</div>
            <div className={s.sub}>
              The page you're looking for doesn't exist or has been moved.
            </div>

            <div className={s.actions}>
              <button className={mergeClasses(s.btnGhost, s.btnMd)} onClick={() => navigate(-1)}>
                <IconArrowLeft size={14} />
                Go back
              </button>
              <Link to="/" className={mergeClasses(s.btnRed, s.btnMd)}>
                <IconSearch size={14} />
                Browse library
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
