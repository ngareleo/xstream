import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    crumbHome: "~",
    crumbMedia: "media",
    crumbFilms: "films",
    breadcrumbScanningFormat: "● scanning {n} of {total}",
    searchPlaceholder: "Search films, directors, genres in every profile…",
    searchAriaLabel: "Search profiles",
    searchClearAriaLabel: "Clear search",
    searchCountFormat: "{matchCount} {matchLabel} · {profileCount} {profileLabel}",
    matchSingular: "match",
    matchPlural: "matches",
    profileSingular: "profile",
    profilePlural: "profiles",
    colHeaderProfile: "Profile / File",
    colHeaderMatch: "Match",
    colHeaderSize: "Size",
    noMatchesFormat: 'No films match "{q}"',
    footerCountsFormat:
      "{profiles} PROFILES · {films} FILMS · {shows} SHOWS ({episodes} EPS) · {unmatched} UNMATCHED",
    footerCta: "+ NEW PROFILE",
  },
});
