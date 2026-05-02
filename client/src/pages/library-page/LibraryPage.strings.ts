import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    libraryHeading: "Tonight's library.",
    emptyEyebrow: "No libraries yet",
    emptyHeading: "Add your first library.",
    emptyBody:
      "Point xstream at a folder of films or shows and we'll match it against OMDb, build the carousel, and surface posters here.",
    emptyCta: "Create a library",
    searchPlaceholder: "Search films, directors, genres…",
    searchAriaLabel: "Search the library",
    clearAriaLabel: "Clear search",
    rowContinueWatching: "Continue watching",
    rowNewReleases: "New releases",
    rowWatchlist: "Watchlist",
    resultsFormat: "Results · {n}",
    filteredFormat: "Filtered · {n} of {total}",
    noResultsForQuery: "No films match “{query}”",
    noResultsForFilters: "No films match the active filters",
  },
});
