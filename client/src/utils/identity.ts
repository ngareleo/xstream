export interface DisplayIdentity {
  /** Title-cased display name derived from the email local-part. */
  name: string;
  /** 1–2 uppercase letters for the avatar badge. */
  initials: string;
}

/**
 * Derive a display name + initials from an email address. Supabase signup
 * captures no name, so the email local-part is our only signal:
 *   leo@gmail.com        → { name: "Leo", initials: "LE" }
 *   john.doe@x.com       → { name: "John", initials: "JD" }
 *   a@x.com              → { name: "A", initials: "A" }
 */
export function identityFromEmail(email: string): DisplayIdentity {
  const local = email.split("@")[0] || email;
  const segments = local.split(/[.\-_+]+/).filter(Boolean);

  let initials: string;
  if (segments.length >= 2) {
    initials = (segments[0][0] + segments[1][0]).toUpperCase();
  } else {
    initials = local.slice(0, 2).toUpperCase();
  }

  const first = segments[0] || local;
  const name = first.charAt(0).toUpperCase() + first.slice(1);

  return { name, initials };
}
