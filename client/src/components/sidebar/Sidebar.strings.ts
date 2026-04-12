import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    // ProfileMenu
    pmUserName: "User",
    pmUserEmail: "user@moran.local",
    pmSectionProfiles: "Profiles",
    pmAllLibraries: "All Libraries",
    pmHome: "Home",
    pmAccountSettings: "Account settings",
    pmSignOut: "Sign out",

    // Sidebar nav items
    navProfiles: "Profiles",
    navLibrary: "Library",
    navWatchlist: "Watchlist",
    navSettings: "Settings",
    navFeedback: "Feedback",

    // Controls
    toggleNavAriaLabel: "Toggle navigation",
    collapseLabel: "Collapse",
    openProfileMenuAriaLabel: "Open profile menu",

    // User info
    userName: "User",
    userSub: "0 profiles \u00b7 0 files",
  },
});
