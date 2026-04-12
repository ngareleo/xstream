import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    headerTitle: "New Library",
    closeTitle: "Close",
    labelName: "Library Name",
    placeholderName: "e.g. Movies 4K",
    labelPath: "Folder Path",
    placeholderPath: "/media/movies",
    browseTitle: "Browse filesystem",
    labelMediaType: "Media Type",
    optionMovies: "Movies",
    optionTvShows: "TV Shows",
    labelExtensions: "File Extensions",
    errorNamePath: "Name and path are required.",
    errorExtensions: "Select at least one file extension.",
    cancel: "Cancel",
    creating: "Creating\u2026",
    create: "Create Library",
  },
});
