import { type FC, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { mergeClasses } from "@griffel/react";
import { IconFolder } from "../../lib/icons.js";
import { DirectoryBrowser } from "../DirectoryBrowser/DirectoryBrowser.js";
import { useProfileFormStyles } from "./ProfileForm.styles.js";

export type MediaType = "MOVIES" | "TV_SHOWS";

export interface ProfileFormValues {
  name: string;
  path: string;
  mediaType: MediaType;
  extensions: string[];
}

interface ProfileFormProps {
  mode: "create" | "edit";
  initial: ProfileFormValues;
  /** Crumbs at the top of the page (last one is rendered bright). */
  crumbs: string[];
  /** Big page heading. */
  title: string;
  eyebrow: string;
  /** Optional subhead under the title. */
  subtitle?: string;
  submitLabel: string;
}

const EXTENSION_PRESETS: Record<MediaType, string[]> = {
  MOVIES: [".mkv", ".mp4", ".avi", ".mov", ".m4v"],
  TV_SHOWS: [".mkv", ".mp4", ".avi", ".mov"],
};

const ALL_EXTENSIONS = [
  ".mkv",
  ".mp4",
  ".avi",
  ".mov",
  ".m4v",
  ".wmv",
  ".flv",
  ".ts",
];

/**
 * Shared form for the Create- and Edit-Profile pages.
 * Pure visual prototype — submitting just navigates back to /profiles.
 */
export const ProfileForm: FC<ProfileFormProps> = ({
  mode,
  initial,
  crumbs,
  title,
  eyebrow,
  subtitle,
  submitLabel,
}) => {
  const s = useProfileFormStyles();
  const navigate = useNavigate();

  const [name, setName] = useState(initial.name);
  const [path, setPath] = useState(initial.path);
  const [mediaType, setMediaType] = useState<MediaType>(initial.mediaType);
  const [extensions, setExtensions] = useState<string[]>(initial.extensions);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  const setMediaTypeAndPreset = (next: MediaType): void => {
    setMediaType(next);
    setExtensions(EXTENSION_PRESETS[next]);
  };

  const toggleExt = (ext: string): void => {
    setExtensions((prev) =>
      prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext],
    );
  };

  const handleSubmit = (): void => {
    if (!name.trim() || !path.trim()) {
      setError("Name and path are required.");
      return;
    }
    if (extensions.length === 0) {
      setError("Pick at least one file extension.");
      return;
    }
    setError(null);
    navigate("/profiles");
  };

  return (
    <div className={s.shell}>
      <div className={s.breadcrumb}>
        <span className={s.crumbDim}>~</span>
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={`${c}-${i}`} style={{ display: "contents" }}>
              <span>/</span>
              <span className={last ? s.crumbBright : undefined}>{c}</span>
            </span>
          );
        })}
        <span className={s.crumbSpacer} />
        <Link to="/profiles" className={s.textAction}>
          Cancel
        </Link>
      </div>

      <div className={s.page}>
        <div className={s.card}>
          <div>
            <div className={s.eyebrow}>· {eyebrow}</div>
            <div className={s.title}>{title}</div>
            {subtitle && <div className={s.subtitle}>{subtitle}</div>}
          </div>

          <div className={s.divider} />

          <div className={s.fieldGroup}>
            <label className={s.label}>Name</label>
            <input
              className={s.input}
              placeholder="Films / 4K UHD"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className={s.fieldGroup}>
            <label className={s.label}>Path</label>
            <div className={s.pathSection}>
              <div className={s.pathRow}>
                <input
                  className={mergeClasses(s.input, s.pathInput)}
                  placeholder="/media/films/4k"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                />
                <button
                  type="button"
                  className={mergeClasses(
                    s.browseBtn,
                    browseOpen && s.browseBtnActive,
                  )}
                  onClick={() => setBrowseOpen((v) => !v)}
                >
                  <IconFolder /> Browse
                </button>
              </div>
              {browseOpen && (
                <div className={s.browserFloat}>
                  <DirectoryBrowser
                    initialPath={path.trim() || "/"}
                    onCancel={() => setBrowseOpen(false)}
                    onSelect={(picked) => {
                      setPath(picked);
                      setBrowseOpen(false);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          <div className={s.fieldGroup}>
            <label className={s.label}>Media type</label>
            <div className={s.segment}>
              <button
                type="button"
                className={mergeClasses(
                  s.segmentBtn,
                  mediaType === "MOVIES" && s.segmentBtnActive,
                )}
                onClick={() => setMediaTypeAndPreset("MOVIES")}
              >
                Movies
              </button>
              <button
                type="button"
                className={mergeClasses(
                  s.segmentBtn,
                  mediaType === "TV_SHOWS" && s.segmentBtnActive,
                )}
                onClick={() => setMediaTypeAndPreset("TV_SHOWS")}
              >
                TV shows
              </button>
            </div>
          </div>

          <div className={s.fieldGroup}>
            <label className={s.label}>File extensions</label>
            <div className={s.extChips}>
              {ALL_EXTENSIONS.map((ext) => (
                <button
                  key={ext}
                  type="button"
                  className={mergeClasses(
                    s.extChip,
                    extensions.includes(ext) && s.extChipActive,
                  )}
                  onClick={() => toggleExt(ext)}
                >
                  {ext}
                </button>
              ))}
            </div>
          </div>

          {error && <div className={s.errorMsg}>{error}</div>}

          {mode === "edit" && confirmDelete && (
            <div className={s.deleteConfirm}>
              <div className={s.deleteConfirmMsg}>
                Delete this profile? Files on disk are untouched — only the
                library entry, posters, and match metadata are removed.
              </div>
              <div className={s.deleteConfirmRow}>
                <button
                  type="button"
                  className={s.textAction}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={mergeClasses(s.textAction, s.textActionDanger)}
                  onClick={() => navigate("/profiles")}
                >
                  Yes, delete
                </button>
              </div>
            </div>
          )}

          <div className={s.footer}>
            {mode === "edit" && !confirmDelete && (
              <button
                type="button"
                className={mergeClasses(s.textAction, s.textActionDanger)}
                onClick={() => setConfirmDelete(true)}
              >
                Delete
              </button>
            )}
            <span className={s.footerSpacer} />
            <Link to="/profiles" className={s.textAction}>
              Cancel
            </Link>
            <button
              type="button"
              className={mergeClasses(s.textAction, s.textActionAccent)}
              onClick={handleSubmit}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
