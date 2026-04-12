import { type FC } from "react";
import { graphql, useLazyLoadQuery } from "react-relay";

import { WatchlistContent } from "~/components/watchlist-content/WatchlistContent.js";
import type { WatchlistPageContentQuery } from "~/relay/__generated__/WatchlistPageContentQuery.graphql.js";

const WATCHLIST_QUERY = graphql`
  query WatchlistPageContentQuery {
    watchlist {
      ...WatchlistContent_watchlistItem
    }
  }
`;

const WatchlistPage: FC = () => {
  const data = useLazyLoadQuery<WatchlistPageContentQuery>(WATCHLIST_QUERY, {});
  return <WatchlistContent watchlist={data.watchlist} />;
};

export default WatchlistPage;
