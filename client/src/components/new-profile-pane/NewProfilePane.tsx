import { mergeClasses } from "@griffel/react";
import { NovaEventingInterceptor, useNovaEventing } from "@nova/react";
import type { EventWrapper } from "@nova/types";
import React, { type FC, useCallback, useState } from "react";
import { graphql, useMutation } from "react-relay";

import {
  type FolderSelectedData,
  isFolderSelectedEvent,
} from "~/components/directory-browser/DirectoryBrowser.events.js";
import { DirectoryBrowser } from "~/components/directory-browser/DirectoryBrowser.js";
import { IconClose, IconFolder } from "~/lib/icons.js";
import type { NewProfilePaneCreateLibraryMutation } from "~/relay/__generated__/NewProfilePaneCreateLibraryMutation.graphql.js";

import {
  createNewProfilePaneClosedEvent,
  createNewProfilePaneLibraryCreatedEvent,
} from "./NewProfilePane.events.js";
import { strings } from "./NewProfilePane.strings.js";
import { useNewProfilePaneStyles } from "./NewProfilePane.styles.js";

const CREATE_LIBRARY_MUTATION = graphql`
  mutation NewProfilePaneCreateLibraryMutation(
    $name: String!
    $path: String!
    $mediaType: MediaType!
    $extensions: [String!]!
  ) {
    createLibrary(name: $name, path: $path, mediaType: $mediaType, extensions: $extensions) {
      id
      name
    }
  }
`;

const EXTENSION_PRESETS: Record<string, string[]> = {
  MOVIES: [".mkv", ".mp4", ".avi", ".mov", ".m4v"],
  TV_SHOWS: [".mkv", ".mp4", ".avi", ".mov"],
};

const ALL_EXTENSIONS = [".mkv", ".mp4", ".avi", ".mov", ".m4v", ".wmv", ".flv", ".ts"];

export const NewProfilePane: FC = () => {
  const styles = useNewProfilePaneStyles();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [mediaType, setMediaType] = useState<"MOVIES" | "TV_SHOWS">("MOVIES");
  const [extensions, setExtensions] = useState<string[]>(EXTENSION_PRESETS.MOVIES);
  const { bubble } = useNovaEventing();
  const submitEventRef = React.useRef<React.MouseEvent | null>(null);

  const [browseOpen, setBrowseOpen] = useState(false);
  const [commit, isPending] =
    useMutation<NewProfilePaneCreateLibraryMutation>(CREATE_LIBRARY_MUTATION);
  const [error, setError] = useState<string | null>(null);

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

  const handleMediaTypeChange = (next: "MOVIES" | "TV_SHOWS"): void => {
    setMediaType(next);
    setExtensions(EXTENSION_PRESETS[next]);
  };

  const toggleExtension = (ext: string): void => {
    setExtensions((prev) => (prev.includes(ext) ? prev.filter((e) => e !== ext) : [...prev, ext]));
  };

  const handleClose = (e: React.MouseEvent): void => {
    void bubble({ reactEvent: e, event: createNewProfilePaneClosedEvent() });
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
      variables: { name: name.trim(), path: path.trim(), mediaType, extensions },
      onCompleted: (data) => {
        const libraryId = data.createLibrary?.id ?? "";
        const ev = submitEventRef.current;
        if (ev) {
          void bubble({
            reactEvent: ev,
            event: createNewProfilePaneLibraryCreatedEvent(libraryId),
          });
        }
      },
      onError: (err) => {
        setError(err.message);
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
            onChange={(e) => handleMediaTypeChange(e.target.value as "MOVIES" | "TV_SHOWS")}
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
        <button className={styles.btnCancel} onClick={handleClose}>
          {strings.cancel}
        </button>
        <button
          className={styles.btnCreate}
          onClick={(e) => handleSubmit(e)}
          disabled={isPending}
          type="button"
        >
          {isPending ? strings.creating : strings.create}
        </button>
      </div>
    </div>
  );
};
