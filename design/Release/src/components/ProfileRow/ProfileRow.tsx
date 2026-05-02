import { type FC, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { type Profile } from "../../data/mock.js";
import { IconChevron } from "../../lib/icons.js";
import { useProfileRowStyles } from "./ProfileRow.styles.js";

interface ProfileRowProps {
  profile: Profile;
  expanded: boolean;
  onToggle: () => void;
  /** Films rendered as the expanded body — use FilmRow components. */
  children: ReactNode;
}

/**
 * Single library row in the Profiles explorer. Owns the chevron + name
 * + match-progress + size + edit-link layout. Click anywhere on the
 * header toggles the expansion. Edit affordance navigates to the
 * EditProfile page; clicks bubble-stop so the row doesn't toggle.
 */
export const ProfileRow: FC<ProfileRowProps> = ({
  profile,
  expanded,
  onToggle,
  children,
}) => {
  const s = useProfileRowStyles();
  const matchPct = (profile.matched / profile.total) * 100;
  const warn = profile.unmatched > 0;
  const hasFilms = Boolean(children);

  return (
    <div className={s.block}>
      <div
        onClick={onToggle}
        className={mergeClasses(s.header, expanded && s.headerExpanded)}
      >
        <span className={mergeClasses(s.chevron, expanded && s.chevronOpen)}>
          <IconChevron />
        </span>
        <div>
          <div className={s.name}>{profile.name}</div>
          <div className={s.path}>{profile.path}</div>
        </div>

        <div>
          {profile.scanning ? (
            <div className={s.scanRow}>
              <div className={s.scanSpinner} />
              {profile.scanProgress?.done}/{profile.scanProgress?.total}
            </div>
          ) : (
            <div className={s.matchRow}>
              <div className={s.matchTrack}>
                <div
                  className={mergeClasses(s.matchFill, warn && s.matchFillWarn)}
                  style={{ width: `${matchPct}%` }}
                />
              </div>
              <span
                className={mergeClasses(s.matchPct, warn && s.matchPctWarn)}
              >
                {Math.round(matchPct)}%
              </span>
            </div>
          )}
        </div>

        <div className={s.size}>{profile.size}</div>
        <div className={s.rowEnd}>
          {profile.scanning ? (
            "SCANNING…"
          ) : (
            <Link
              to={`/profiles/${profile.id}/edit`}
              onClick={(e) => e.stopPropagation()}
              className={s.editLink}
            >
              EDIT
            </Link>
          )}
        </div>
      </div>

      {expanded && hasFilms && <div className={s.filmsList}>{children}</div>}
    </div>
  );
};
