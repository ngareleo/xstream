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
    actionsTitle: "Bulk actions",
    actionsDesc:
      "localStorage is the higher-trust source — your local toggles win over the server until you clear them.",
    clearLocalOverrides: "Clear local overrides",
    clearLocalOverridesHint:
      "Drops every flag's local cache. Reload the page after clicking — the server values then become authoritative.",
    resetAllToDefaults: "Reset all to defaults",
    resetAllToDefaultsHint:
      "Sets every flag back to its registry default and persists to the server.",
    clearedToast: "Local overrides cleared. Reload the page to pull server values.",
  },
});
