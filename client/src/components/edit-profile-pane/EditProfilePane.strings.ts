import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    headerTitle: "Edit Library",
    closeTitle: "Close",
    labelName: "Name",
    placeholderName: "My Movies",
    labelPath: "Path",
    placeholderPath: "/media/movies",
    browseTitle: "Browse filesystem",
    labelMediaType: "Media Type",
    optionMovies: "Movies",
    optionTvShows: "TV Shows",
    labelExtensions: "File Extensions",
    cancel: "Cancel",
    save: "Save",
    saving: "Saving…",
    errorNamePath: "Name and path are required.",
    errorExtensions: "Select at least one file extension.",
    delete: "Delete library",
    deleting: "Deleting…",
    deleteConfirm: "Permanently delete this library and all its indexed video data?",
    deleteYes: "Yes, delete",
    deleteNo: "Cancel",
  },
});
