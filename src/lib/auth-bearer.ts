import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * Project-specific replacement for the generated `attachSupabaseAuth`.
 *
 * The generated attacher reads `supabase.auth.getSession()` once and, when the
 * session is momentarily unavailable (cold start, token refresh in flight),
 * sends the request with no `Authorization` header — the server middleware then
 * throws "Unauthorized: No authorization header provided" and the page blanks.
 *
 * This version retries: it waits briefly for the session to hydrate, attempts a
 * refresh, and only then gives up by sending the user back to sign-in instead
 * of firing a request that is guaranteed to fail.
 */
async function resolveAccessToken(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) return token;

    if (attempt === 1) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed.session?.access_token) return refreshed.session.access_token;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return null;
}

export const attachAuthBearer = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    const token = await resolveAccessToken();

    if (!token) {
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/auth")) {
        window.location.replace("/auth");
      }
      // Avoid a doomed request that surfaces as a blank error screen.
      throw new Error("Your session has expired. Please sign in again.");
    }

    return next({ headers: { Authorization: `Bearer ${token}` } });
  },
);
