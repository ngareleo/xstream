import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    dangerTitle: "Danger Zone",
    dangerDesc:
      "Dev-only utilities for clearing server state during testing. Each action is gated against active jobs and in-flight scans.",
    wipeDbTitle: "Wipe Database",
    wipeDbDesc:
      "Drop every library, video, film, show, metadata, scan progress, transcode job, and watch history row. Preserves your OMDb key and feature flags.",
    wipePostersTitle: "Wipe Poster Cache",
    wipePostersDesc:
      "Delete every cached poster from disk. The background worker re-downloads from OMDb on its next 15s cycle.",
    wipeSegmentsTitle: "Wipe Segment Cache",
    wipeSegmentsDesc:
      "Delete every cached fMP4 segment from disk and clear the in-memory job store.",
    wipeAllTitle: "Wipe Everything",
    wipeAllDesc: "Kill any active transcode jobs, then run the three wipes above. Hard reset.",
    btnIdle: "Wipe",
    btnConfirm: "Click again to confirm",
    btnPending: "Wiping…",
    statusOk: "Done at {time}",
    statusErr: "Failed: {error}",
  },
});
