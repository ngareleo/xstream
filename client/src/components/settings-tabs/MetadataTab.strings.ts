import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    sectionTitle: "OMDb API Key",
    sectionDesc:
      "Used for automatic movie metadata matching (title, poster, rating, plot). Free tier allows 1,000 requests per day. Get your key at omdbapi.com.",
    label: "API Key",
    placeholder: "e.g. abc12345",
    saveBtn: "Save Key",
    savingBtn: "Saving\u2026",
    successMsg: "API key saved.",
  },
});
