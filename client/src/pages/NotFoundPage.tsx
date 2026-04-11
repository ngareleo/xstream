/**
 * NotFoundPage — 404 catch-all page.
 *
 * Rendered by the `*` route inside ShellLayout (AppShell provides header +
 * sidebar). The atmospheric treatment (grain + radial gradient) matches the
 * Player's idle overlay so the error state feels like part of the same design
 * language rather than a default browser screen.
 *
 * Styles live in global.css under the .nf-* namespace.
 */

import { type FC } from "react";
import { Link, useNavigate } from "react-router-dom";

import { DevThrowTarget } from "~/components/dev-tools/DevToolsContext.js";
import { IconArrowLeft, IconSearch } from "~/lib/icons.js";

export const NotFoundPage: FC = () => {
  const navigate = useNavigate();

  return (
    <DevThrowTarget id="NotFound">
      <div className="nf-root">
        <div className="nf-bg" />
        <div className="nf-grain" />

        <div className="nf-body">
          <div className="nf-code">404</div>
          <div className="nf-title">Page not found</div>
          <div className="nf-sub">The page you're looking for doesn't exist or has been moved.</div>

          <div className="nf-actions">
            <button className="btn btn-ghost btn-md" onClick={() => void navigate(-1)}>
              <IconArrowLeft size={14} />
              Go back
            </button>
            <Link to="/" className="btn btn-red btn-md">
              <IconSearch size={14} />
              Browse library
            </Link>
          </div>
        </div>
      </div>
    </DevThrowTarget>
  );
};
