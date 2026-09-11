// A privileged Supabase client using the service-role secret key --
// bypasses every RLS/Storage policy entirely. This exists for exactly one
// thing today: permanently removing a user's own Supabase Auth account
// (the auth.users row + login credential) as part of self-serve account
// deletion (see actions/account.ts) -- something no anon/authenticated-role
// client can do for itself, and the one piece of "delete my account" that
// genuinely needs admin privileges (everything else -- Storage files, the
// Postgres User row and its cascade -- works fine through the caller's own
// already-verified session/connection).
//
// NEVER use this for anything that takes a client-supplied id for *which*
// row/file to touch -- the caller must always scope it to the already-
// authenticated requireUser() result, never trust-me-bro input.
//
// SUPABASE_SERVICE_ROLE_KEY has no NEXT_PUBLIC_ prefix, so it's never
// bundled to the browser -- server-only, same as DATABASE_URL. It isn't in
// every environment's .env.local yet (added 2026-09-11 specifically to
// enable full account deletion): get it from the Supabase dashboard ->
// Settings -> API Keys -> "service_role" secret key, and add it directly
// to .env.local -- it should never be pasted anywhere else (chat, a
// commit, a shared doc), since it bypasses every access control this app
// has. isAdminClientConfigured() lets callers degrade gracefully (still
// delete all the person's data and files) when it isn't set yet, rather
// than hard-failing account deletion entirely.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function isAdminClientConfigured(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
