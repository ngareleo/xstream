import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    libraryHeading: "Tonight's library.",
    emptyWatermark: "library",
    searchPlaceholder: "Search films, directors, genres…",
    searchAriaLabel: "Search the library",
    clearAriaLabel: "Clear search",
    rowMovies: "Movies",
    rowTvShows: "TV shows",
    resultsFormat: "Results · {n}",
    filteredFormat: "Filtered · {n} of {total}",
    noResultsForQuery: "No films match “{query}”",
    noResultsForFilters: "No films match the active filters",
  },
});
