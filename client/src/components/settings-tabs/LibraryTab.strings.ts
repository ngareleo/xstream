import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    sectionTitle: "Library Scan",
    sectionDesc:
      "Trigger an immediate rescan of all configured library directories. New files will be added and missing files removed.",
    scanBtn: "Scan Libraries",
    scanningBtn: "Scanning\u2026",
    successMsg: "Scan triggered successfully.",
  },
});
