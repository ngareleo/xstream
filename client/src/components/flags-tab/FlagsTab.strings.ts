import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    sectionTitle: "Feature Flags",
    sectionDesc:
      "Toggle experimental behaviours and tune playback parameters. Changes persist per-user and apply on the next playback session.",
    categoryPlayback: "Playback",
    categoryTelemetry: "Telemetry",
    categoryUi: "UI",
    categoryExperimental: "Experimental",
    defaultHint: "(default)",
  },
});
