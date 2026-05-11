/**
 * Supabase auth service. Wraps the JS SDK with the operations the auth
 * pages and Settings → Account tab need:
 *
 *   - `restoreSession()` — boot-time hydration from localStorage.
 *   - `signIn` / `signUp` / `signOut` — auth-page handlers.
 *   - `resetPassword` — signed-out flow (sends Supabase email).
 *   - `changePassword` — Settings → Account flow (reauth-then-update).
 *   - `getSession` — read current session for the Relay network layer.
 *   - `getAccessToken` — convenience for the Authorization header.
 *   - `subscribeToAuthChanges` — push session deltas (token refresh,
 *     remote signout) so the route guard and userContext stay in sync.
 *
 * Threat model: only the public `PUBLIC_SUPABASE_URL` and
 * `PUBLIC_SUPABASE_ANON_KEY` are read here. Both are designed to be
 * embeddable in client bundles (Supabase RLS protects user data).
 * See `docs/architecture/Deployment/07-Supabase-Identity-Security.md`.
 *
 * If the build was packaged without these env vars, `getSupabase()`
 * throws on first use — the auth pages catch it and render a "auth not
 * configured" error rather than silently failing. That keeps the
 * misconfiguration loud during dev / staging.
 */

import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

import { clearUserContext, setUserContext } from "./userContext.js";

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

let _client: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured: set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY at build time."
    );
  }
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
  /**
   * Human-readable error message when the operation failed. Pages
   * render this inline below the form. `null` on success.
   */
  error: string | null;
}

/**
 * Read the session from localStorage and (if present) refresh it, then
 * mirror the user id into `userContext` so telemetry emitted before the
 * first render still carries `user.id`. Called once from `main.tsx` —
 * must complete before Relay queries fire.
 */
export async function restoreSession(): Promise<Session | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id) {
      setUserContext(data.session.user.id);
    }
    return data.session ?? null;
  } catch {
    // Misconfigured Supabase or transient storage error — treat as
    // signed-out. The route guard will redirect to /signin where the
    // error surfaces visibly.
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { user: null, session: null, error: error.message };
    }
    if (data.user?.id) {
      setUserContext(data.user.id);
    }
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    return { user: null, session: null, error: errorMessage(err) };
  }
}

export async function signUp(email: string, password: string): Promise<AuthResult> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      return { user: null, session: null, error: error.message };
    }
    // With "Confirm email" disabled in the Supabase project (alpha
    // policy), signUp returns a live session immediately. If the
    // project ever flips on email confirmation, `session` will be null
    // and the caller is responsible for rendering a "check your inbox"
    // state instead of redirecting to /.
    if (data.user?.id && data.session) {
      setUserContext(data.user.id);
    }
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    return { user: null, session: null, error: errorMessage(err) };
  }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.auth.signOut();
  } finally {
    clearUserContext();
  }
}

export interface ResetPasswordResult {
  error: string | null;
}

export async function resetPassword(email: string): Promise<ResetPasswordResult> {
  try {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    return { error: error?.message ?? null };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

export interface ChangePasswordResult {
  error: string | null;
}

/**
 * Settings → Account flow. Supabase's `updateUser({ password })` does
 * NOT challenge the current password — anyone who steals an active
 * session could rotate it silently. We reauthenticate first by signing
 * in with `(email, current)` and only update on success. The signin
 * step replaces the session in localStorage, then `updateUser` rotates
 * the password and emits a fresh session.
 */
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
      return { error: "Current password is incorrect." };
    }
    const { error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

/**
 * Subscribe to auth state changes — token refreshes, remote signouts,
 * SIGNED_IN broadcasts from other tabs. Used by `main.tsx` to keep
 * `userContext` in lockstep with the canonical Supabase session.
 */
export function subscribeToAuthChanges(callback: (session: Session | null) => void): () => void {
  try {
    const supabase = getSupabase();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user.id) {
        setUserContext(session.user.id);
      } else {
        clearUserContext();
      }
      callback(session);
    });
    return () => data.subscription.unsubscribe();
  } catch {
    return () => {
      /* no-op when Supabase wasn't configured */
    };
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unexpected error";
}
