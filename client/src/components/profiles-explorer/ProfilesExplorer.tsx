import { type FC, useMemo, useState } from "react";

import { FilmRow } from "~/components/film-row/FilmRow";
import { ProfileRow } from "~/components/profile-row/ProfileRow";
import { type LibraryScanSnapshot } from "~/hooks/useLibraryScanSubscription";
import { IconClose, IconSearch } from "~/lib/icons";
import { filmMatches } from "~/pages/profiles-page/filmMatches";
import type { ProfilesPageContentQuery$data } from "~/relay/__generated__/ProfilesPageContentQuery.graphql";

import { strings } from "./ProfilesExplorer.strings";
import { useProfilesExplorerStyles } from "./ProfilesExplorer.styles";

type Library = ProfilesPageContentQuery$data["libraries"][number];

interface ProfilesExplorerProps {
  libraries: ReadonlyArray<Library>;
  selectedFilmId: string | null;
  selectedLibraryId: string | undefined;
  scanByLibrary: Map<string, LibraryScanSnapshot>;
  onOpenFilm: (id: string) => void;
  onEditFilm: (id: string) => void;
  onCreateProfile: () => void;
}

export const ProfilesExplorer: FC<ProfilesExplorerProps> = ({
  libraries,
  selectedFilmId,
  selectedLibraryId,
  scanByLibrary,
  onOpenFilm,
  onEditFilm,
  onCreateProfile,
}) => {
  const styles = useProfilesExplorerStyles();

  const initialExpanded = useMemo(() => {
    const set = new Set<string>();
    if (libraries.length > 0) set.add(libraries[0].id);
    if (selectedLibraryId) set.add(selectedLibraryId);
    return set;
  }, [libraries, selectedLibraryId]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(initialExpanded);

  const toggleProfile = (id: string): void => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const isSearching = trimmedSearch.length > 0;

  const visibleProfiles = useMemo(() => {
    return libraries
      .map((lib) => ({
        library: lib,
        videos: isSearching
          ? lib.videos.edges.map((e) => e.node).filter((node) => filmMatches(node, trimmedSearch))
          : lib.videos.edges.map((e) => e.node),
      }))
      .filter((entry) => !isSearching || entry.videos.length > 0);
  }, [libraries, trimmedSearch, isSearching]);

  const matchCount = useMemo(
    () => visibleProfiles.reduce((sum, p) => sum + p.videos.length, 0),
    [visibleProfiles]
  );

  let totalFilms = 0;
  let totalShows = 0;
  let totalUnmatched = 0;
  for (const lib of libraries) {
    for (const e of lib.videos.edges) {
      if (e.node.mediaType === "MOVIES") totalFilms += 1;
      if (e.node.mediaType === "TV_SHOWS") totalShows += 1;
      if (!e.node.title) totalUnmatched += 1;
    }
  }
  // TODO(release-design): wire episode counts from the seasons subselection.
  const totalEpisodes = 0;
  const scanningCount = scanByLibrary.size;

  return (
    <div className={styles.root}>
      <div className={styles.breadcrumb}>
        <span className={styles.crumbDim}>{strings.crumbHome}</span>
        <span>/</span>
        <span>{strings.crumbMedia}</span>
        <span>/</span>
        <span className={styles.crumbBright}>{strings.crumbFilms}</span>
        {scanningCount > 0 && (
          <span className={styles.breadcrumbScanning}>
            {strings.formatString(strings.breadcrumbScanningFormat, {
              n: scanningCount,
              total: libraries.length,
            })}
          </span>
        )}
      </div>

      <div className={styles.searchBar}>
        <span className={styles.searchPrompt} aria-hidden="true">
          <IconSearch />
        </span>
        <input
          className={styles.searchInput}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={strings.searchPlaceholder}
          aria-label={strings.searchAriaLabel}
          spellCheck={false}
          autoComplete="off"
        />
        {isSearching && (
          <>
            <span className={styles.searchCount}>
              {strings.formatString(strings.searchCountFormat, {
                matchCount,
                matchLabel: matchCount === 1 ? strings.matchSingular : strings.matchPlural,
                profileCount: visibleProfiles.length,
                profileLabel:
                  visibleProfiles.length === 1 ? strings.profileSingular : strings.profilePlural,
              })}
            </span>
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearch("")}
              aria-label={strings.searchClearAriaLabel}
            >
              <IconClose width={12} height={12} />
            </button>
          </>
        )}
      </div>

      <div className={styles.colHeader}>
        <div />
        <div>{strings.colHeaderProfile}</div>
        <div>{strings.colHeaderMatch}</div>
        <div>{strings.colHeaderSize}</div>
        <div />
      </div>

      <div className={styles.rowsScroll}>
        {visibleProfiles.length === 0 ? (
          <div className={styles.noMatches}>
            {strings.formatString(strings.noMatchesFormat, { q: search.trim() })}
          </div>
        ) : (
          visibleProfiles.map(({ library, videos }) => {
            const scan = scanByLibrary.get(library.id);
            const scanProgress =
              scan && scan.done !== null && scan.total !== null
                ? { done: scan.done, total: scan.total }
                : null;
            return (
              <ProfileRow
                key={library.id}
                library={library}
                expanded={isSearching || expandedIds.has(library.id)}
                onToggle={() => {
                  if (!isSearching) toggleProfile(library.id);
                }}
                scanning={Boolean(scan)}
                scanProgress={scanProgress}
              >
                {videos.map((node) => (
                  <FilmRow
                    key={node.id}
                    video={node}
                    selected={selectedFilmId === node.id}
                    onOpen={() => onOpenFilm(node.id)}
                    onEdit={() => onEditFilm(node.id)}
                  />
                ))}
              </ProfileRow>
            );
          })
        )}
      </div>

      <div className={styles.footer}>
        <span>
          {strings.formatString(strings.footerCountsFormat, {
            profiles: libraries.length,
            films: totalFilms,
            shows: totalShows,
            episodes: totalEpisodes,
            unmatched: totalUnmatched,
          })}
        </span>
        <button type="button" className={styles.footerCta} onClick={onCreateProfile}>
          {strings.footerCta}
        </button>
      </div>
    </div>
  );
};
