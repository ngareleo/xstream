import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    emailTitle: "Email",
    emailDesc: "The address associated with your xstream account.",
    signedOut: "Signed out.",
    changePasswordTitle: "Change password",
    changePasswordDesc:
      "Updating your password signs you back in with the new credentials. Other tabs may be signed out.",
    currentPasswordLabel: "Current password",
    newPasswordLabel: "New password",
    confirmPasswordLabel: "Confirm new password",
    submit: "Update password",
    submitting: "Updating…",
    success: "Password updated.",
    mismatch: "New passwords don't match.",
    tooShort: "New password must be at least 8 characters.",
    signOutTitle: "Sign out",
    signOutDesc: "End your session on this device and return to the sign-in page.",
    signOutBtn: "Sign out",
  },
});
