import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor, useNovaEventing } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, useCallback, useState } from "react";
import { graphql, useFragment, useMutation } from "react-relay";

import {
  type FolderSelectedData,
  isFolderSelectedEvent,
} from "~/components/directory-browser/DirectoryBrowser.events.js";
import { DirectoryBrowser } from "~/components/directory-browser/DirectoryBrowser.js";
import { IconClose, IconFolder } from "~/lib/icons.js";
import type { EditProfilePane_library$key } from "~/relay/__generated__/EditProfilePane_library.graphql.js";
import type { EditProfilePaneDeleteLibraryMutation } from "~/relay/__generated__/EditProfilePaneDeleteLibraryMutation.graphql.js";
import type { EditProfilePaneUpdateLibraryMutation } from "~/relay/__generated__/EditProfilePaneUpdateLibraryMutation.graphql.js";

import {
  createEditProfilePaneClosedEvent,
  createEditProfilePaneDeletedEvent,
  createEditProfilePaneSavedEvent,
} from "./EditProfilePane.events.js";
import { strings } from "./EditProfilePane.strings.js";
import { useEditProfilePaneStyles } from "./EditProfilePane.styles.js";

const LIBRARY_FRAGMENT = graphql`
  fragment EditProfilePane_library on Library {
    id
    name
    path
    mediaType
    videoExtensions
  }
`;

const UPDATE_LIBRARY_MUTATION = graphql`
  mutation EditProfilePaneUpdateLibraryMutation(
    $id: ID!
    $name: String
    $path: String
    $mediaType: MediaType
    $extensions: [String!]
  ) {
    updateLibrary(
      id: $id
      name: $name
      path: $path
      mediaType: $mediaType
      extensions: $extensions
    ) {
      id
      name
      path
      mediaType
      videoExtensions
    }
  }
`;

const DELETE_LIBRARY_MUTATION = graphql`
  mutation EditProfilePaneDeleteLibraryMutation($id: ID!) {
    deleteLibrary(id: $id)
  }
`;

const ALL_EXTENSIONS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv", ".flv", ".ts"];

interface Props {
  library: EditProfilePane_library$key;
}

export const EditProfilePane: FC<Props> = ({ library }) => {
  const data = useFragment(LIBRARY_FRAGMENT, library);
  const styles = useEditProfilePaneStyles();
  const { bubble } = useNovaEventing();
  const submitEventRef = React.useRef<React.MouseEvent | null>(null);
  const deleteEventRef = React.useRef<React.MouseEvent | null>(null);

  const [name, setName] = useState(data.name);
  const [path, setPath] = useState(data.path);
  const [mediaType, setMediaType] = useState<"MOVIES" | "TV_SHOWS">(
    data.mediaType === "TV_SHOWS" ? "TV_SHOWS" : "MOVIES"
  );
  const [extensions, setExtensions] = useState<string[]>([...data.videoExtensions]);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);

  const browserInterceptor = useCallback(
    async (wrapper: EventWrapper): Promise<EventWrapper | undefined> => {
      if (isFolderSelectedEvent(wrapper) && wrapper.event.data) {
        const { path: selected } = wrapper.event.data() as FolderSelectedData;
        setPath(selected);
        setBrowseOpen(false);
        return undefined;
      }
      return wrapper;
    },
    []
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const [commit, isPending] =
    useMutation<EditProfilePaneUpdateLibraryMutation>(UPDATE_LIBRARY_MUTATION);

  const [commitDelete, isDeletePending] =
    useMutation<EditProfilePaneDeleteLibraryMutation>(DELETE_LIBRARY_MUTATION);

  const toggleExtension = (ext: string): void => {
    setExtensions((prev) => (prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext]));
  };

  const handleClose = (e: React.MouseEvent): void => {
    void bubble({ reactEvent: e, event: createEditProfilePaneClosedEvent() });
  };

  const handleSubmit = (e: React.MouseEvent): void => {
    submitEventRef.current = e;
    if (!name.trim() || !path.trim()) {
      setError(strings.errorNamePath);
      return;
    }
    if (extensions.length === 0) {
      setError(strings.errorExtensions);
      return;
    }
    setError(null);
    commit({
      variables: {
        id: data.id,
        name: name.trim(),
        path: path.trim(),
        mediaType,
        extensions,
      },
      onCompleted: () => {
        const ev = submitEventRef.current;
        if (ev) {
          void bubble({ reactEvent: ev, event: createEditProfilePaneSavedEvent() });
        }
      },
      onError: (err) => {
        setError(err.message);
      },
    });
  };

  const handleDelete = (e: React.MouseEvent): void => {
    deleteEventRef.current = e;
    commitDelete({
      variables: { id: data.id },
      onCompleted: () => {
        const ev = deleteEventRef.current;
        if (ev) {
          void bubble({ reactEvent: ev, event: createEditProfilePaneDeletedEvent() });
        }
      },
    });
  };

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerTitle}>{strings.headerTitle}</div>
        <button className={styles.closeBtn} onClick={handleClose} title={strings.closeTitle}>
          <IconClose size={13} />
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.fieldGroup}>
          <label className={styles.label}>{strings.labelName}</label>
          <input
            className={styles.input}
            placeholder={strings.placeholderName}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>{strings.labelPath}</label>
          <div className={styles.pathRow}>
            <input
              className={styles.pathInput}
              placeholder={strings.placeholderPath}
              value={path}
              onChange={(e) => {
                setPath(e.target.value);
                if (browseOpen) setBrowseOpen(false);
              }}
            />
            <button
              className={mergeClasses(styles.browseBtn, browseOpen && styles.browseBtnActive)}
              onClick={() => setBrowseOpen((prev) => !prev)}
              type="button"
              title={strings.browseTitle}
            >
              <IconFolder size={13} />
            </button>
          </div>

          {browseOpen && (
            <NovaEventingInterceptor interceptor={browserInterceptor}>
              <DirectoryBrowser initialPath={path.trim() || "/"} />
            </NovaEventingInterceptor>
          )}
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>{strings.labelMediaType}</label>
          <select
            className={styles.select}
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value as "MOVIES" | "TV_SHOWS")}
          >
            <option value="MOVIES">{strings.optionMovies}</option>
            <option value="TV_SHOWS">{strings.optionTvShows}</option>
          </select>
        </div>

        <div className={styles.fieldGroup}>
          <label className={styles.label}>{strings.labelExtensions}</label>
          <div className={styles.extChips}>
            {ALL_EXTENSIONS.map((ext) => (
              <button
                key={ext}
                className={mergeClasses(
                  styles.extChip,
                  extensions.includes(ext) && styles.extChipActive
                )}
                onClick={() => toggleExtension(ext)}
                type="button"
              >
                {ext}
              </button>
            ))}
          </div>
        </div>

        {error && <div className={styles.errorMsg}>{error}</div>}
      </div>

      <div className={styles.footer}>
        {showDeleteConfirm ? (
          <div className={styles.footerDelete}>
            <div className={styles.deleteConfirmMsg}>{strings.deleteConfirm}</div>
            <div className={styles.deleteConfirmRow}>
              <button
                className={styles.btnCancel}
                onClick={() => setShowDeleteConfirm(false)}
                style={{ flex: "1" }}
              >
                {strings.deleteNo}
              </button>
              <button
                className={styles.btnDelete}
                onClick={handleDelete}
                disabled={isDeletePending}
                style={{ flex: "1" }}
                type="button"
              >
                {isDeletePending ? strings.deleting : strings.deleteYes}
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              className={styles.btnDelete}
              onClick={() => setShowDeleteConfirm(true)}
              type="button"
            >
              {strings.delete}
            </button>
            <div className={styles.footerMain}>
              <button className={styles.btnCancel} onClick={handleClose} style={{ flex: "1" }}>
                {strings.cancel}
              </button>
              <button
                className={styles.btnSave}
                onClick={(e) => handleSubmit(e)}
                disabled={isPending}
                type="button"
                style={{ flex: "2" }}
              >
                {isPending ? strings.saving : strings.save}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
