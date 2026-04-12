import { type FC } from "react";
import { graphql, type PreloadedQuery, usePreloadedQuery } from "react-relay";

import type { FilmDetailLoaderQuery } from "~/relay/__generated__/FilmDetailLoaderQuery.graphql.js";

import { FilmDetailPaneAsync } from "./FilmDetailPaneAsync.js";

// Shared preloaded-query bridge used by any page that opens a film detail pane.
// The caller issues loadQuery(FILM_DETAIL_QUERY, { videoId }) on card-click so
// the network request fires before this component mounts in the Suspense boundary.

export const FILM_DETAIL_QUERY = graphql`
  query FilmDetailLoaderQuery($videoId: ID!) {
    video(id: $videoId) {
      ...FilmDetailPane_video
    }
  }
`;

interface Props {
  queryRef: PreloadedQuery<FilmDetailLoaderQuery>;
}

export const FilmDetailLoader: FC<Props> = ({ queryRef }) => {
  const data = usePreloadedQuery<FilmDetailLoaderQuery>(FILM_DETAIL_QUERY, queryRef);
  if (!data.video) return null;
  return <FilmDetailPaneAsync video={data.video} />;
};
