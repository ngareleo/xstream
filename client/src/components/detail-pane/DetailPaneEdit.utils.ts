import type { DetailPaneSearchQuery$data } from "~/relay/__generated__/DetailPaneSearchQuery.graphql.js";

export type SearchResult = DetailPaneSearchQuery$data["searchOmdb"][number];

export const SEARCH_DEBOUNCE_MS = 300;
