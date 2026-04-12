import { useNovaEventing } from "@nova/react";
import { type FC, useEffect, useRef } from "react";
import { graphql, type PreloadedQuery, usePreloadedQuery } from "react-relay";

import { FilmDetailPaneAsync } from "~/components/film-detail-pane/FilmDetailPaneAsync.js";
import type { FilmDetailLoaderQuery } from "~/relay/__generated__/FilmDetailLoaderQuery.graphql.js";

import { createLibraryIdResolvedEvent } from "./FilmDetailLoader.events.js";

// Shared preloaded-query bridge used by any page that opens a film detail pane.
// The caller issues loadQuery(FILM_DETAIL_QUERY, { videoId }) on card-click so
// the network request fires before this component mounts in the Suspense boundary.

export const FILM_DETAIL_QUERY = graphql`
  query FilmDetailLoaderQuery($videoId: ID!) {
    video(id: $videoId) {
      library {
        id
      }
      ...FilmDetailPane_video
    }
    ...LinkSearch_query @arguments(query: "", skip: true)
  }
`;

interface Props {
  queryRef: PreloadedQuery<FilmDetailLoaderQuery>;
  linking?: boolean;
}

export const FilmDetailLoader: FC<Props> = ({ queryRef, linking = false }) => {
  const data = usePreloadedQuery<FilmDetailLoaderQuery>(FILM_DETAIL_QUERY, queryRef);
  const { generateEvent } = useNovaEventing();

  const libraryId = data.video?.library?.id;
  useEffect(() => {
    if (libraryId) {
      void generateEvent({ event: createLibraryIdResolvedEvent(libraryId) });
    }
    // Intentionally only run when libraryId first resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId]);

  // Capture the initial query data as a stable fragment key for LinkSearch.
  // When the Relay store updates (e.g. searchOmdb results arrive), usePreloadedQuery
  // returns a new `data` object. If we passed `data` directly, useRefetchableFragment
  // inside LinkSearch would see a new fragmentRef and reset its subscription back to
  // the parent's data (skip: true) — wiping suggestions mid-search.
  // Freezing the ref here means LinkSearch always sees the same key; after refetch()
  // it reads from its own internal query and is unaffected by parent rerenders.
  const searchRefSnapshot = useRef(data);

  if (!data.video) return null;
  return (
    <FilmDetailPaneAsync
      video={data.video}
      linking={linking}
      searchRef={searchRefSnapshot.current}
    />
  );
};
