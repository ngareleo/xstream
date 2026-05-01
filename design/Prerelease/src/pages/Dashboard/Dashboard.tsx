/**
 * Dashboard / Profiles page — the app's home screen.
 *
 * Layout:
 *   AppShell grid → header (full-width) + sidebar (220px) + main (1fr).
 *   Inside `.main`: a single `split-body` that fills all remaining height.
 *   `split-body` is a 2-column grid: left content (1fr) | right pane (0 → 360px).
 *
 * The hero slideshow and location bar live inside split-left so that when the
 * right pane slides in it occupies the full height of the main area — the hero
 * is not behind the pane, it's squeezed with the rest of the left column.
 *
 * Right pane modes (URL-encoded so browser history works):
 *   ?pane=new-profile            → NewProfilePane (create a new library directory)
 *   ?pane=film-detail&filmId=xxx → FilmDetailPane for the given film
 *   (no params)                  → pane closed
 *
 * Toggling behaviour:
 *   Clicking a film row that is already open in the detail pane closes it.
 *   This mirrors standard file-manager behaviour — second click = deselect.
 *
 * Navigation:
 *   Play links use React Router <Link> (not <a href>) so they push to the
 *   history stack. After watching, navigate(-1) in the Player returns to
 *   /?pane=film-detail&filmId=xxx with the pane already open.
 *
 * Data (mock → real):
 *   - `profiles`       → ProfilesPageContent's useLazyLoadQuery
 *   - `films`          → fragment on each profile row
 *   - `user`           → viewer field on the root query
 *   - "scanning" state → transcodeJobUpdated subscription or scanLibraries mutation result
 */

import { mergeClasses } from "@griffel/react";
import { type FC, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useSplitResize } from "../../hooks/useSplitResize.js";
import { AppHeader } from "../../components/AppHeader/AppHeader.js";
import { Slideshow } from "../../components/Slideshow/Slideshow.js";
import { LinkSearch, type Suggestion } from "../../components/LinkSearch/LinkSearch.js";
import {
  IconRefresh,
  IconPlus,
  IconChevronDown,
  IconFilm,
  IconTv,
  IconDocument,
  IconWarning,
  IconPlay,
  IconEdit,
  IconClose,
} from "../../lib/icons.js";
import {
  profiles,
  films,
  user,
  type Profile,
  type Film,
} from "../../data/mock.js";
import { useSimulatedLoad } from "../../hooks/useSimulatedLoad.js";
import { usePageLoading } from "../../components/LoadingBar/LoadingBarContext.js";
import { DevThrowTarget } from "../../components/DevTools/DevToolsContext.js";
import { useDashboardStyles } from "./Dashboard.styles.js";
import { useAppHeaderStyles, useHeaderActionStyles } from "../../components/AppHeader/AppHeader.styles.js";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// The four pane states. Stored as the `pane` URL search param so that
// opening/closing the pane creates a history entry and Back/Forward work.
type PaneMode = "none" | "new-profile" | "profile-detail" | "film-detail";

const EXT_OPTIONS = [".mkv", ".mp4", ".mov", ".avi", ".webm", ".m4v", ".ts", ".m2ts"];

// ── Small shared components ────────────────────────────────────────────────

const ResolutionBadge: FC<{ res: string }> = ({ res }) => {
  const s = useDashStyles();
  return (
    <span
      className={mergeClasses(s.badge, res === "4K" ? s.badgeRed : s.badgeGray)}
      style={{ fontSize: 9, padding: "1px 5px" }}
    >
      {res}
    </span>
  );
};

// Griffel styles accessors — declared outside components so hooks can be called inside
// sub-components without prop drilling.
const useDashStyles = useDashboardStyles;
const useHdrStyles = useAppHeaderStyles;
const useHdrActionStyles = useHeaderActionStyles;

// Inline match-rate bar shown in the profile directory row.
// Turns yellow when there are unmatched files.
const MatchBar: FC<{ pct: number; warn: boolean }> = ({ pct, warn }) => {
  const s = useDashStyles();
  return (
    <div className={s.matchBar}>
      <div className={s.matchTrack}>
        <div className={mergeClasses(s.matchFill, warn && s.matchFillWarn)} style={{ width: `${pct}%` }} />
      </div>
      <span style={{ fontSize: 11, color: warn ? "var(--yellow)" : "var(--muted)" }}>{pct}%</span>
    </div>
  );
};

// ── FilmRow ───────────────────────────────────────────────────────────────
// A single file entry inside an expanded profile. Clicking the row opens the
// detail pane; the edit button and play/link buttons stop propagation so they
// don't also open the pane.
const FilmRow: FC<{
  film: Film;
  onSelect: (id: string) => void;
  onEdit:   (id: string) => void;
  paneOpen: boolean;
}> = ({ film, onSelect, onEdit, paneOpen }) => {
  const s = useDashStyles();
  const [hovering, setHovering] = useState(false);
  const isUnmatched = !film.matched;
  const isTv        = film.mediaType === "tv";
  const label       = film.title ?? film.filename;

  return (
    <div
      className={mergeClasses(s.dirChildRow, paneOpen && s.dirChildRowOpen)}
      onClick={() => onSelect(film.id)}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div className={mergeClasses(s.childIcon, isUnmatched && s.childIconWarn)}>
        {isUnmatched ? (
          <IconWarning size={14} style={{ color: "rgba(245,197,24,0.5)" }} />
        ) : isTv ? (
          <IconTv size={14} style={{ color: "var(--muted2)" }} />
        ) : (
          <IconDocument size={14} style={{ color: "var(--muted2)" }} />
        )}
      </div>
      <div className={s.childNameCell}>
        <div className={mergeClasses(s.childName, isUnmatched && s.childNameWarn)}>{label}</div>
        <div className={s.childFilename}>{film.filename}</div>
      </div>
      <div className={s.childCell} style={{ display: paneOpen ? "none" : undefined }}>
        {film.year ? `${film.year} · ${film.duration}` : film.duration}
      </div>
      <div className={s.childCell}>
        <ResolutionBadge res={film.resolution} />
      </div>
      <div className={mergeClasses(s.childCell, s.childCellMono)} style={{ display: paneOpen ? "none" : undefined }}>{film.size}</div>
      <div className={mergeClasses(s.childActions, hovering && s.childActionsVisible)} style={{ gap: 3 }}>
        <button
          className={s.btnSurfaceXs}
          onClick={(e) => { e.stopPropagation(); onEdit(film.id); }}
          data-tip="Edit link"
        >
          <IconEdit size={11} />
        </button>
        {isUnmatched ? (
          // Unmatched file: offer a "Link" action to manually connect it to metadata.
          <button
            className={s.btnYellow}
            onClick={(e) => { e.stopPropagation(); onEdit(film.id); }}
          >
            Link
          </button>
        ) : (
          // Matched file: direct play link — pushes to history so Back returns here.
          <Link
            to={`/player/${film.id}`}
            className={s.btnRedXs}
            onClick={(e) => e.stopPropagation()}
          >
            <IconPlay size={10} />
          </Link>
        )}
      </div>
    </div>
  );
};

// ── ProfileRow ────────────────────────────────────────────────────────────
// Top-level directory row. Clicking expands/collapses the child film list
// and simultaneously marks this profile as "selected" (drives detail pane if
// profile-detail mode is ever added). The scanning state shows a live
// spinner + progress counter instead of the match bar.
const ProfileRow: FC<{
  profile:       Profile;
  expanded:      boolean;
  selected:      boolean;
  paneOpen:      boolean;
  onToggle:      () => void;
  onSelect:      () => void;
  onFilmSelect:  (id: string) => void;
  onFilmEdit:    (id: string) => void;
}> = ({ profile, expanded, selected, paneOpen, onToggle, onSelect, onFilmSelect, onFilmEdit }) => {
  const s = useDashStyles();
  const [hovering, setHovering] = useState(false);
  const profileFilms = films.filter((f) => f.profile === profile.id);
  const totalItems   = profile.type === "tv" ? (profile.episodeCount ?? 0) : (profile.filmCount ?? 0);
  const matchPct     = totalItems > 0 ? Math.round((profile.matched / totalItems) * 100) : 0;
  const hasWarn      = profile.unmatched > 0;
  const typeLabel    =
    profile.type === "tv"
      ? `${profile.showCount} shows`
      : `${profile.filmCount} films`;

  return (
    <>
      <div
        className={mergeClasses(s.dirRow, paneOpen && s.dirRowOpen, selected && s.dirRowSelected, profile.scanning && s.dirRowScanning)}
        onClick={() => { onToggle(); onSelect(); }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        <div className={s.dirIcon}>
          <span className={s.chevron}>
            <IconChevronDown
              size={10}
              style={{
                transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                transition: "transform 0.18s ease",
              }}
            />
          </span>
        </div>
        <div className={s.dirNameCell} style={{ paddingLeft: 4 }}>
          <div className={s.dirName}>{profile.name}</div>
          <div className={s.dirPath}>{profile.path}</div>
        </div>
        <div className={s.dirCell} style={{ display: paneOpen ? "none" : undefined }}>{typeLabel}</div>
        <div className={s.dirCell} style={{ display: paneOpen ? "none" : undefined }}>
          {profile.scanning ? (
            // Scanning: live progress indicator.
            // In production, driven by the scanLibraries mutation + subscription.
            <div className={s.scanInline}>
              <div className={s.scanSpinner} />
              {profile.scanProgress?.done}/{profile.scanProgress?.total}
            </div>
          ) : (
            <MatchBar pct={matchPct} warn={hasWarn} />
          )}
        </div>
        <div className={mergeClasses(s.dirCell, s.dirCellMono)} style={{ display: paneOpen ? "none" : undefined }}>{profile.size}</div>
        <div className={mergeClasses(s.dirActions, (hovering || selected) && s.dirActionsVisible)}>
          {profile.scanning ? (
            <span style={{ fontSize: 10, color: "var(--green)" }}>Scanning…</span>
          ) : (
            <>
              <button className={s.btnSurfaceXs} data-tip="Re-scan" onClick={(e) => e.stopPropagation()}>
                <IconRefresh size={11} />
              </button>
              <button className={s.btnSurfaceXs} data-tip="Edit" onClick={(e) => e.stopPropagation()}>
                <IconEdit size={11} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Child film rows — animated with CSS max-height transition */}
      <div className={mergeClasses(s.dirChildren, expanded && s.dirChildrenOpen)}>
        {profileFilms.map((film) => (
          <FilmRow
            key={film.id}
            film={film}
            paneOpen={paneOpen}
            onSelect={onFilmSelect}
            onEdit={onFilmEdit}
          />
        ))}
      </div>
    </>
  );
};

// ── NewProfilePane ────────────────────────────────────────────────────────
// Form to add a new media directory. Currently visual-only; in production the
// "Create & Scan" button fires the createLibrary mutation followed by
// scanLibraries, and the pane closes on success.
const NewProfilePane: FC<{ onClose: () => void }> = ({ onClose }) => {
  const s = useDashStyles();
  const [activeExts, setActiveExts] = useState(new Set([".mkv", ".mp4", ".mov"]));

  const toggleExt = (ext: string) => {
    setActiveExts((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className={s.paneHeader}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--white)" }}>New Profile</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
              Add a directory to your library
            </div>
          </div>
          <button className={s.paneCloseBtn} onClick={onClose} title="Close">
            <IconClose size={13} />
          </button>
        </div>
      </div>
      <div className={s.paneBody} style={{ padding: 18 }}>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Profile Name</label>
          <input className={s.formInput} type="text" placeholder="e.g. Endurance Movies" />
          <div className={s.formHint}>A friendly name for this library.</div>
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Directory Path</label>
          <div className={s.formRow}>
            <input className={s.formInput} type="text" placeholder="/home/user/Videos/Movies" />
            <button className={s.btnSurface}>Browse</button>
          </div>
          <div className={s.formHint}>Moran scans all subdirectories recursively.</div>
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel}>Media Type</label>
          <select className={s.formSelect}>
            <option>Movies</option>
            <option>TV Shows</option>
            <option>Mixed</option>
          </select>
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel} style={{ marginBottom: 10 }}>File Extensions</label>
          <div className={s.extChips}>
            {EXT_OPTIONS.map((ext) => (
              <span
                key={ext}
                className={mergeClasses(s.extChip, activeExts.has(ext) && s.extChipOn)}
                onClick={() => toggleExt(ext)}
              >
                {ext}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className={s.paneFoot}>
        <button className={s.btnRed}>
          Create &amp; Scan
        </button>
        <button className={s.btnCancel} onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};

// ── FilmDetailPane ────────────────────────────────────────────────────────
// Slide-in detail view for a specific file. The 200px poster area uses the
// film's gradient as a placeholder — in production replace with a real
// poster/backdrop image from the metadata provider (TMDB, etc).
//
// `linking` and `onSetLinking` are owned by the parent (URL-encoded) so that:
//   - switching to a different film always starts with linking=false
//   - the browser Back button can exit linking mode
const FilmDetailPane: FC<{
  film: Film;
  linking: boolean;
  onSetLinking: (v: boolean) => void;
  onClose: () => void;
}> = ({ film, linking, onSetLinking, onClose }) => {
  const s = useDashStyles();

  const handleLinked = (_suggestion: Suggestion) => {
    onSetLinking(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Poster area with overlaid action bar */}
      <div style={{ height: 200, position: "relative", overflow: "hidden", flexShrink: 0, background: film.gradient }}>
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(to bottom,rgba(0,0,0,0.58) 0%,transparent 40%,rgba(0,0,0,0.84) 100%)",
        }} />
        <div className={s.fdActions}>
          <Link to={`/player/${film.id}`} className={mergeClasses(s.fdActionBtn, s.fdActionBtnPrimary)}>
            <IconPlay size={10} />
            PLAY
          </Link>
          <div className={s.fdActionSep} />
          <button
            className={mergeClasses(s.fdActionBtn, linking && s.fdActionBtnActive)}
            onClick={() => onSetLinking(!linking)}
          >
            <IconEdit size={10} />
            RE-LINK
          </button>
          <div style={{ flex: 1 }} />
          <button className={s.fdActionClose} onClick={onClose}>
            <IconClose size={13} />
          </button>
        </div>
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "12px 16px", zIndex: 2 }}>
          <div style={{ fontFamily: "var(--font-head)", fontSize: 22, letterSpacing: ".06em", color: "var(--white)", lineHeight: 1 }}>
            {film.title ?? film.filename}
          </div>
          {film.year && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 3 }}>
              {film.year} · {film.genre} · {film.director}
            </div>
          )}
        </div>
      </div>

      {/* Link search replaces the body when RE-LINK is active */}
      {linking ? (
        <LinkSearch
          filename={film.filename}
          onLink={handleLinked}
          onCancel={() => onSetLinking(false)}
        />
      ) : (
      /* Scrollable detail body */
      <div className={s.rightPaneBody}>
        {/* Technical spec badges: resolution, HDR format, codec, audio */}
        {film.rating && (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", padding: "12px 16px", borderBottom: `1px solid var(--border)` }}>
            <span className={mergeClasses(s.badge, s.badgeRed)}>{film.resolution}</span>
            {film.hdr && <span className={mergeClasses(s.badge, s.badgeGray)}>{film.hdr}</span>}
            <span className={mergeClasses(s.badge, s.badgeGray)}>{film.codec}</span>
            <span className={mergeClasses(s.badge, s.badgeGray)}>{film.audio}</span>
            <span className={mergeClasses(s.badge, s.badgeGray)}>{film.audioChannels}</span>
          </div>
        )}

        {film.rating && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: `1px solid var(--border)` }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--yellow)" }}>{film.rating}</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>IMDb</span>
            <span style={{ fontSize: 11, color: "var(--muted2)" }}>·</span>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{film.duration}</span>
          </div>
        )}

        {film.plot && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid var(--border)` }}>
            <div className={s.sectionLabel}>Synopsis</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 1.7 }}>{film.plot}</div>
          </div>
        )}

        {film.cast.length > 0 && (
          <div style={{ padding: "12px 16px", borderBottom: `1px solid var(--border)` }}>
            <div className={s.sectionLabel}>Cast</div>
            <div className={s.detailCast}>
              {film.cast.map((c) => (
                <span key={c} className={s.castChip}>{c}</span>
              ))}
            </div>
          </div>
        )}

        {/* Raw file metadata — filename, container, size, bitrate, frame rate */}
        <div style={{ padding: "12px 16px" }}>
          <div className={s.sectionLabel}>File</div>
          {[
            ["Filename",   film.filename],
            ["Container",  film.container],
            ["Size",       film.size],
            ["Bitrate",    film.bitrate],
            ["Frame Rate", film.frameRate],
          ].map(([k, v]) => (
            <div key={k} className={s.fdInfoRow}>
              <span style={{ fontSize: 10, color: "var(--muted2)", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>{k}</span>
              <span style={{ fontSize: 12, color: "rgba(245,245,245,0.75)", fontFamily: "monospace" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};

// ── Dashboard (page root) ─────────────────────────────────────────────────
export const Dashboard: FC = () => {
  const loading = useSimulatedLoad();
  usePageLoading(loading);

  const ds = useDashStyles();
  const ahs = useHdrStyles();
  const hs = useHdrActionStyles();

  const { paneWidth, containerRef, onResizeMouseDown } = useSplitResize(360);

  // Profile rows that are expanded (showing their child film list).
  // Local state only — not URL-encoded because expansion is transient UX.
  // Seeded from the URL's filmId so that deep-linking to a film detail
  // automatically expands the profile that contains it.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const filmId = new URLSearchParams(window.location.search).get("filmId");
    if (!filmId) return new Set();
    const film = films.find((f) => f.id === filmId);
    return film ? new Set([film.profile]) : new Set();
  });
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  // Pane state lives in the URL so Back/Forward navigates through pane history.
  // ?pane=film-detail&filmId=xxx  →  FilmDetailPane
  // ?pane=new-profile             →  NewProfilePane
  // (no param)                    →  pane closed
  const [searchParams, setSearchParams] = useSearchParams();
  const paneParam    = searchParams.get("pane") as PaneMode | null;
  const paneMode: PaneMode = paneParam ?? "none";
  const selectedFilmId     = searchParams.get("filmId");
  // `linking` lives in the URL so switching films naturally resets it and
  // the browser Back button exits linking mode.
  const linking = searchParams.get("linking") === "true";

  const closePane = () => setSearchParams({});

  const setLinking = (v: boolean) => {
    const params: Record<string, string> = { pane: "film-detail", filmId: selectedFilmId! };
    if (v) params.linking = "true";
    setSearchParams(params);
  };

  const toggleProfile = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Selecting a film row toggles the detail pane.
  // Clicking the same row twice closes the pane (deselect behaviour).
  // Note: no `linking` param → linking resets to false for the new film.
  const openFilmDetail = (id: string) => {
    if (paneMode === "film-detail" && selectedFilmId === id) {
      closePane();
    } else {
      setSearchParams({ pane: "film-detail", filmId: id });
    }
  };

  // Opens the detail pane with linking mode active from the start.
  // Used by the edit icon button on film rows.
  const openFilmLinking = (id: string) => {
    setSearchParams({ pane: "film-detail", filmId: id, linking: "true" });
  };

  const paneOpen   = paneMode !== "none";
  const selectedFilm = selectedFilmId ? films.find((f) => f.id === selectedFilmId) : null;

  const totalFiles = profiles.reduce((sum, p) => sum + (p.filmCount ?? p.episodeCount ?? 0), 0);
  const totalSize  = "4.3 TB";

  return (
    <DevThrowTarget id="Dashboard">
      <>
      <AppHeader collapsed={false}>
        <span className={ds.topbarSub} id="topbarSub" />
        <div className={ahs.actionsSlot}>
          {/* Scan All triggers a full re-scan of every library.
              In production: fires scanLibraries mutation, then subscribes to progress. */}
          <button className={hs.btn} data-tip="Rescan all libraries" onClick={() => {}}>
            <IconRefresh size={14} />
            Scan All
          </button>
          <div className={hs.sep}><div className={hs.sepLine} /></div>
          <button
            className={mergeClasses(hs.btn, hs.btnPrimary)}
            onClick={() => setSearchParams({ pane: "new-profile" })}
          >
            <IconPlus size={14} />
            New Profile
          </button>
        </div>
      </AppHeader>

      <div className="main">
        {/*
         * split-body is the outer grid container. When pane-open:
         *   grid-template-columns: 1fr 360px
         * The hero, location bar, directory list, and footer all live inside
         * split-left so the right pane spans the full height of the main area.
         */}
        <div
          ref={containerRef}
          className={ds.splitBody}
          style={paneOpen ? { gridTemplateColumns: `1fr 4px ${paneWidth}px` } : undefined}
        >
          <div className={ds.splitLeft} style={{ padding: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>

            {/* Hero: slideshow fills the container; greeting overlays the left third */}
            <div className={ds.hero}>
              <Slideshow />
              <div className={ds.greeting}>
                <div className={ds.greetingText}>
                  {getGreeting()}, <span className={ds.greetingName}>{user.name}</span>
                </div>
                <div className={ds.greetingSub}>
                  {profiles.length} profiles &nbsp;·&nbsp; {totalFiles} files &nbsp;·&nbsp; {totalSize} on disk
                </div>
              </div>
            </div>


            {/* Directory column headers */}
            <div className={mergeClasses(ds.dirHeader, paneOpen && ds.dirHeaderOpen)}>
              <div />
              <div className={ds.dirCol} style={{ paddingLeft: 20 }}>Name</div>
              <div className={ds.dirCol} style={{ display: paneOpen ? "none" : undefined }}>Files</div>
              <div className={ds.dirCol} style={{ display: paneOpen ? "none" : undefined }}>Matched</div>
              <div className={ds.dirCol} style={{ display: paneOpen ? "none" : undefined }}>Size</div>
              <div className={ds.dirCol} />
            </div>

            {/* Scrollable profile + film tree */}
            <div className={ds.dirList}>
              {profiles.map((p) => (
                <ProfileRow
                  key={p.id}
                  profile={p}
                  expanded={expandedIds.has(p.id)}
                  selected={selectedProfileId === p.id}
                  paneOpen={paneOpen}
                  onToggle={() => toggleProfile(p.id)}
                  onSelect={() => setSelectedProfileId(p.id)}
                  onFilmSelect={openFilmDetail}
                  onFilmEdit={openFilmLinking}
                />
              ))}
            </div>

            <div className={ds.dirFooter}>
              <div className={ds.dirFooterStat}><span className={ds.dirFooterStatNum}>{profiles.length}</span> profiles</div>
              <div className={ds.dirFooterStat}><span className={ds.dirFooterStatNum}>{totalFiles}</span> total files</div>
              <div className={ds.dirFooterStat}><span className={ds.dirFooterStatNum}>{totalSize}</span> on disk</div>
            </div>
          </div>

          {/* Resize handle — only present when pane is open */}
          {paneOpen && (
            <div className={ds.resizeHandle} onMouseDown={onResizeMouseDown} />
          )}

          {/* Right pane — renders the active pane mode or nothing */}
          <div className={ds.rightPane}>
            {paneMode === "new-profile" && (
              <NewProfilePane onClose={closePane} />
            )}
            {paneMode === "film-detail" && selectedFilm && (
              <FilmDetailPane
                key={selectedFilm.id}
                film={selectedFilm}
                linking={linking}
                onSetLinking={setLinking}
                onClose={closePane}
              />
            )}
          </div>
        </div>
      </div>
      </>
    </DevThrowTarget>
  );
};
