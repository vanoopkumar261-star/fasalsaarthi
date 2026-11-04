import { supabase } from "./supabase";

/**
 * `Authorization: Bearer <access token>` for calls into the web app's /api
 * routes, or an empty object when signed out.
 *
 * The web app authenticates with a session cookie, which React Native has no
 * equivalent of. Those routes read the same identity from this header instead
 * (see the web repo's `src/lib/supabase-server.ts`), which is what makes the
 * assistant answer with this farmer's own crops and makes a leaf scan land in
 * their history rather than vanishing.
 *
 * getSession() reads the cached session and refreshes it if it has expired, so
 * this is cheap enough to call per request.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    // Signed out or storage unavailable — the call still goes out, just
    // unauthenticated, exactly as it did before.
    return {};
  }
}
