import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    heading: "Playback History",
    description:
      "Each session records a traceId that links all streaming activity in Seq. Copy a traceId and paste it into the Seq search bar to inspect the full trace.",
    empty: "No sessions recorded yet. Play a video to create an entry.",
    columnTitle: "Title",
    columnResolution: "Resolution",
    columnTime: "Started",
    columnTrace: "Trace ID",
    copied: "Copied",
    copy: "Copy",
  },
});
