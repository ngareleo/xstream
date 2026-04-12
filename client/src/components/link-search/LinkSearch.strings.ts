import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    linkingFile: "Linking file",
    searchPlaceholder: "Search for a movie or show title…",
    clearSearch: "Clear search",
    cancel: "Cancel",
    noResults: "No results found",
    omdbNotConfiguredTitle: "OMDb API key not set",
    omdbNotConfiguredBody:
      "To search for metadata, add your OMDb API key in Settings → Metadata. You can get a free key at omdbapi.com (1,000 requests/day).",
  },
});
