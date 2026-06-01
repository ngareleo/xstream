/** Supabase auth wrapper. See `docs/architecture/Identity/`. */

import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

import { env } from "~/config/env.js";
import { authUrl } from "~/config/rustOrigin.js";
import { getClientLogger } from "~/telemetry.js";

import { LocalStorageKey, readLocal, writeLocal } from "./localStore.js";
import { clearUserContext, setUserContext } from "./userContext.js";

function log() {
  return getClientLogger("auth");
}

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error(
      "Supabase is not configured: set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY at build time."
    );
  }
  _client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return _client;
}

export interface AuthResult {
  user: User | null;
  session: Session | null;
  /** Human-readable error message; `null` on success. */
  error: string | null;
}

interface LocalClaims {
  sub: string;
  email: string | null;
  /** Absolute expiry, seconds since epoch. */
  exp: number;
}

/** The signed local session token, or `null` when none is stored. */
export function getLocalSessionToken(): string | null {
  return readLocal(LocalStorageKey.Session);
}

/** Decode (without verifying) the local session token's claims. */
function decodeLocalClaims(token: string): LocalClaims | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    // base64url → base64, re-padding to a multiple of 4 (JWT segments are
    // emitted unpadded; `atob` rejects `length % 4 === 1` otherwise).
    let b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const parsed = JSON.parse(atob(b64)) as { sub?: string; email?: string | null; exp?: number };
    if (!parsed.sub || typeof parsed.exp !== "number") return null;
    return { sub: parsed.sub, email: parsed.email ?? null, exp: parsed.exp };
  } catch {
    return null;
  }
}

/** Claims of the stored token when present and not past its absolute expiry. */
function validLocalClaims(): LocalClaims | null {
  const token = getLocalSessionToken();
  if (!token) return null;
  const claims = decodeLocalClaims(token);
  if (!claims) return null;
  if (claims.exp * 1000 <= Date.now()) return null;
  return claims;
}

/**
 * Exchange a verified Supabase access token for a service-signed local session
 * token (the service verifies the Supabase JWT online, then mints a ~30-day
 * offline-valid session). Stores the token and mirrors identity into
 * `userContext`. Requires connectivity — this is the once-per-month online step.
 */
async function exchangeForLocalSession(supabaseAccessToken: string): Promise<boolean> {
  try {
    const resp = await fetch(authUrl("/auth/session"), {
      method: "POST",
      headers: { Authorization: `Bearer ${supabaseAccessToken}` },
    });
    if (!resp.ok) {
      log().warn("local session exchange rejected", { status: resp.status });
      return false;
    }
    const body = (await resp.json()) as { token: string; userId: string; email: string | null };
    writeLocal(LocalStorageKey.Session, body.token);
    setUserContext(body.userId, body.email ?? null);
    return true;
  } catch (err) {
    log().warn("local session exchange failed", { error: errorMessage(err) });
    return false;
  }
}

/** Restore identity on boot. Prefers the local session token (validated
 *  offline). Falls back to minting one from a still-live Supabase session —
 *  this seamlessly migrates a user who was signed in before the local-session
 *  model existed, and requires connectivity. Resolves `true` when signed in.
 *  See docs/architecture/Identity/02-Session-And-Refresh.md. */
export async function restoreSession(): Promise<boolean> {
  const claims = validLocalClaims();
  if (claims) {
    setUserContext(claims.sub, claims.email);
    log().info("restoreSession: restored from local session token");
    return true;
  }
  // No (valid) local token. If Supabase still holds a session, exchange it for
  // one now — covers first boot after upgrading and the just-signed-up case.
  try {
    const { data } = await getSupabase().auth.getSession();
    const accessToken = data.session?.access_token;
    if (accessToken) {
      const ok = await exchangeForLocalSession(accessToken);
      log().info("restoreSession: migrated from Supabase session", { ok });
      return ok;
    }
    log().info("restoreSession: no local token and no Supabase session — signed out");
  } catch (err) {
    log().warn("restoreSession: Supabase fallback failed", { error: errorMessage(err) });
  }
  return false;
}

let restorePromise: Promise<boolean> | null = null;

/** Restore the session at most once per page load. The router's auth-gate
 *  loaders and the bootstrap share this promise, so the gate never decides
 *  "signed out" before restoration has finished — the boot race that bounced
 *  a valid session to /signin on refresh. */
export function ensureSessionRestored(): Promise<boolean> {
  restorePromise ??= restoreSession();
  return restorePromise;
}

/** The Bearer token attached to every server request — the local session. */
export async function getAccessToken(): Promise<string | null> {
  return getLocalSessionToken();
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      log().warn("signIn rejected by Supabase", { error: error.message });
      return { user: null, session: null, error: error.message };
    }
    const accessToken = data.session?.access_token;
    if (!accessToken || !(await exchangeForLocalSession(accessToken))) {
      return {
        user: null,
        session: null,
        error: "Signed in, but couldn't establish a local session. Check your connection.",
      };
    }
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    log().error("signIn threw", { error: errorMessage(err) });
    return { user: null, session: null, error: errorMessage(err) };
  }
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      log().warn("signUp rejected by Supabase", { error: error.message });
      return { user: null, session: null, error: error.message };
    }
    // Session is null when email confirmation is on; caller redirects to /signin
    // in that case. When a session is returned, mint the local session now.
    if (data.session?.access_token) {
      await exchangeForLocalSession(data.session.access_token);
    }
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    log().error("signUp threw", { error: errorMessage(err) });
    return { user: null, session: null, error: errorMessage(err) };
  }
}

export async function signOut(): Promise<void> {
  // Revoke the local session server-side (destroys the cookie/session row).
  const token = getLocalSessionToken();
  if (token) {
    try {
      await fetch(authUrl("/auth/logout"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      log().warn("local session revoke failed; clearing locally anyway", {
        error: errorMessage(err),
      });
    }
  }
  writeLocal(LocalStorageKey.Session, null);
  try {
    await getSupabase().auth.signOut();
  } catch (err) {
    log().warn("supabase signOut threw; clearing local state anyway", {
      error: errorMessage(err),
    });
  }
  clearUserContext();
}

export interface ResetPasswordResult {
  error: string | null;
}

export async function resetPassword(email: string): Promise<ResetPasswordResult> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      log().warn("resetPassword rejected by Supabase", { error: error.message });
    }
    return { error: error?.message ?? null };
  } catch (err) {
    log().error("resetPassword threw", { error: errorMessage(err) });
    return { error: errorMessage(err) };
  }
}

export interface ChangePasswordResult {
  error: string | null;
}

/** Reauth-then-update password change. See `docs/architecture/Identity/01-Sign-In-Flow.md` §"Change password". */
export async function changePassword(
  currentPassword: string,
  nextPassword: string
): Promise<ChangePasswordResult> {
  try {
    const supabase = getSupabase();
    const { data: userData } = await supabase.auth.getUser();
    const email = userData.user?.email;
    if (!email) {
      return { error: "Not signed in." };
    }
    const reauth = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauth.error) {
      log().warn("changePassword reauth rejected", { error: reauth.error.message });
      return { error: "Current password is incorrect." };
    }
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) {
      log().warn("changePassword updateUser rejected", { error: error.message });
      return { error: error.message };
    }
    return { error: null };
  } catch (err) {
    log().error("changePassword threw", { error: errorMessage(err) });
    return { error: errorMessage(err) };
  }
}

/** Subscribe to Supabase auth-state changes. Identity is driven by the local
 *  session (not Supabase), so this no longer mutates `userContext` — Supabase's
 *  background token refreshes must never disturb the local-session gate. It
 *  only forwards the event to callers that observe Supabase state. */
export function subscribeToAuthChanges(callback: (session: Session | null) => void): () => void {
  try {
    const supabase = getSupabase();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return () => data.subscription.unsubscribe();
  } catch (err) {
    log().warn("subscribeToAuthChanges failed; auth state will not propagate", {
      error: errorMessage(err),
    });
    return () => {};
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}
