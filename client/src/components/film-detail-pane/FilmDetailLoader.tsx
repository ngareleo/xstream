import { type FC, useEffect } from "react";
import { graphql, type PreloadedQuery, usePreloadedQuery } from "react-relay";

import type { FilmDetailLoaderQuery } from "~/relay/__generated__/FilmDetailLoaderQuery.graphql.js";

import { FilmDetailPaneAsync } from "./FilmDetailPaneAsync.js";

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
  }
`;

interface Props {
  queryRef: PreloadedQuery<FilmDetailLoaderQuery>;
  linking?: boolean;
  /** Called once with the library ID when the query resolves — used to auto-expand the library row. */
  onLibraryId?: (libraryId: string) => void;
}

export const FilmDetailLoader: FC<Props> = ({ queryRef, linking = false, onLibraryId }) => {
  const data = usePreloadedQuery<FilmDetailLoaderQuery>(FILM_DETAIL_QUERY, queryRef);

  const libraryId = data.video?.library?.id;
  useEffect(() => {
    if (libraryId && onLibraryId) onLibraryId(libraryId);
    // Intentionally only run when libraryId first resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId]);

  if (!data.video) return null;
  return <FilmDetailPaneAsync video={data.video} linking={linking} />;
};
