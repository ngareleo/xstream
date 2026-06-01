import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    closeLabel: "Close detail pane",
    expandLabel: "Expand to fullscreen detail",
    expandTitle: "Expand",
    play: "Play",
    continue: "Continue",
    edit: "Edit",
    unmatched: "Unmatched file",
    onDisk: "ON DISK",
    cast: "CAST",
    file: "FILE",
    seasons: "SEASONS & EPISODES",
    seasonsCountSingular: "1 season",
    seasonsCountPluralFormat: "{n} seasons",
    seasonsStatFormat: "{available} / {total} on disk",
    editEyebrow: "· edit · re-link to OMDb",
    editSearchPlaceholder: "Search OMDb by title, director, or IMDb ID…",
    editEmpty: "Type to search OMDb. Pick a result to link to.",
    editNoMatchesFormat: 'No matches for "{q}".',
    editCancel: "[ESC] Cancel",
    editLink: "[↩] Link",
    saveError: "Failed to link. Try again.",
    relinkedToastFormat: 'Re-linked to "{title}".',
  },
});
