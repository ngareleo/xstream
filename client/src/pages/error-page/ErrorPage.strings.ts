import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    eyebrow: "· SOMETHING BROKE",
    title: "Something went wrong.",
    body: "An unexpected error occurred. Please try again, or head back to the library.",
    showDetails: "Show details",
    hideDetails: "Hide details",
    backToLibrary: "← Back to library",
    retry: "Retry",
    placeholderStack:
      "Error: no error context available\n  This page is reachable directly at /error for QA visibility.",
  },
});
