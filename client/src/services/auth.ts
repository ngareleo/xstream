/** Supabase auth wrapper. See `docs/architecture/Identity/`. */

import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

import { getClientLogger } from "~/telemetry.js";

import { clearUserContext, setUserContext } from "./userContext.js";

function log() {
  return getClientLogger("auth");
}

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
  /** Human-readable error message; `null` on success. */
  error: string | null;
}

/** Hydrate the Supabase session from localStorage and mirror into `userContext`. */
export async function restoreSession(): Promise<Session | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (data.session?.user.id) {
      setUserContext(data.session.user.id);
    }
    return data.session ?? null;
  } catch (err) {
    log().warn("restoreSession failed; treating as signed-out", { error: errorMessage(err) });
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    return data.session ?? null;
  } catch (err) {
    log().warn("getSession failed", { error: errorMessage(err) });
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
      log().warn("signIn rejected by Supabase", { error: error.message });
      return { user: null, session: null, error: error.message };
    }
    if (data.user?.id) {
      setUserContext(data.user.id);
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
    // Session is null when email confirmation is on; caller redirects to /signin in that case.
    if (data.user?.id && data.session) {
      setUserContext(data.user.id);
    }
    return { user: data.user, session: data.session, error: null };
  } catch (err) {
    log().error("signUp threw", { error: errorMessage(err) });
    return { user: null, session: null, error: errorMessage(err) };
  }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.auth.signOut();
  } catch (err) {
    log().warn("signOut threw; clearing local state anyway", { error: errorMessage(err) });
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

/** Subscribe to Supabase auth-state changes. Keeps `userContext` in lockstep. */
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
