import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    emptyWatermark: "profiles",
    crumbHome: "~",
    crumbMedia: "media",
    crumbFilms: "films",
    breadcrumbScanningFormat: "● scanning {n} of {total}",
    footerCountsFormat:
      "{profiles} PROFILES · {films} FILMS · {shows} SHOWS ({episodes} EPS) · {unmatched} UNMATCHED",
    footerCta: "+ NEW PROFILE",
  },
});
