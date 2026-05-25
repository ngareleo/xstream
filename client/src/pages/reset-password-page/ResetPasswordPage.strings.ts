import LocalizedStrings from "react-localization";

export const strings = new LocalizedStrings({
  en: {
    eyebrow: "· LOST THE KEY",
    title: "Reset password",
    subtitle: "Tell us where to send the reset link. We'll do the rest.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    submit: "Send reset link",
    submitting: "Sending…",
    back: "Back to sign in",
    sentEyebrow: "· LINK SENT",
    sentTitle: "Check your email",
    sentSubtitleFormat:
      "We sent a reset link to {email} if an account exists. The link expires in 30 minutes.",
    sentDone: "Back to sign in",
    sentResend: "Try a different email",
  },
});
