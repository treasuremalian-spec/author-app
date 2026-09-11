"use server";

// Self-serve account deletion (author request, 2026-09-11 -- closing a gap
// the 2026-09-07 privacy audit flagged: the Privacy Policy promises users
// can request deletion, but there was no in-app way to actually do it; see
// security_notes.md). Deletes, in this order: every Storage file the user
// owns across all four buckets, then the user's own Postgres `User` row --
// every other table cascades from User via onDelete: Cascade in
// schema.prisma (Project -> ManuscriptNode -> Scene -> SceneVersion,
// SceneCard, Character, Location, StoryBibleEntry, Friendship, Sprint*,
// Notification, DailyWritingStat, UserAchievement, etc. -- confirmed by
// reading the full schema, not assumed) -- and finally, only when
// SUPABASE_SERVICE_ROLE_KEY is configured, the actual Supabase Auth
// account itself, so the login credential is gone too, not just the app
// data. Storage and database first, auth credential last, on purpose: if
// that last step fails (or the admin key just isn't set up yet), the
// person's data and files are still fully and permanently gone either way
// -- nothing is ever left half-deleted with a working login still
// attached to it.
import { prisma } from "@author-app/database";
import { requireUser } from "@/lib/actions/shared";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminClientConfigured } from "@/lib/supabase/admin";

const BUCKETS = ["covers", "avatars", "manuscript-images", "manuscript-imports"] as const;

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/** Recursively collects every real file path under `prefix` in `bucket`.
 * Storage's .list() only returns one level at a time, and two of our four
 * buckets nest files under a project-id subfolder
 * ("<user id>/<project id>/<file>"), not flat under the user id alone --
 * see CoverUploadButton/BackgroundImageUploadButton (covers) and
 * Toolbar.tsx's inline-image upload (manuscript-images). A "folder" entry
 * from .list() has id: null (Storage's own convention for a
 * pseudo-directory, since it has no real directories); a real file always
 * has an id. */
async function collectFilePaths(
  supabase: SupabaseServerClient,
  bucket: string,
  prefix: string
): Promise<string[]> {
  const { data: entries } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (!entries || entries.length === 0) return [];

  const paths: string[] = [];
  for (const entry of entries) {
    const entryPath = `${prefix}/${entry.name}`;
    if (entry.id === null) {
      paths.push(...(await collectFilePaths(supabase, bucket, entryPath)));
    } else {
      paths.push(entryPath);
    }
  }
  return paths;
}

async function deleteAllStorageFiles(supabase: SupabaseServerClient, userId: string) {
  for (const bucket of BUCKETS) {
    const paths = await collectFilePaths(supabase, bucket, userId);
    if (paths.length === 0) continue;
    // remove() isn't guaranteed to accept an unlimited batch -- chunk
    // defensively since a prolific writer could plausibly have more than a
    // few hundred manuscript images across every project.
    for (let i = 0; i < paths.length; i += 1000) {
      await supabase.storage.from(bucket).remove(paths.slice(i, i + 1000));
    }
  }
}

export interface DeleteAccountResult {
  ok: boolean;
  authAccountRemoved: boolean;
  error?: string;
}

/** Permanently deletes the signed-in user's entire account. Requires the
 * literal confirmation text "DELETE" (case-insensitive) so this can be
 * called directly from a client confirm dialog without a second server
 * round-trip just to check what was typed. */
export async function deleteMyAccount(confirmation: string): Promise<DeleteAccountResult> {
  const user = await requireUser();

  if (confirmation.trim().toUpperCase() !== "DELETE") {
    return { ok: false, authAccountRemoved: false, error: 'Type "DELETE" to confirm.' };
  }

  const supabase = await createClient();

  await deleteAllStorageFiles(supabase, user.id);

  await prisma.user.delete({ where: { id: user.id } }).catch((err: unknown) => {
    // A user who signed up but never finished onboarding has no User row
    // yet (it's created in onboarding.ts's upsert, not at signup) -- fine,
    // there's simply nothing to cascade-delete in that case.
    const message = err instanceof Error ? err.message : "";
    if (!message.includes("Record to delete does not exist")) {
      throw err;
    }
  });

  let authAccountRemoved = false;
  if (isAdminClientConfigured()) {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (!error) {
      authAccountRemoved = true;
    } else {
      // Not fatal -- their data is already gone either way (see module
      // comment) -- but worth knowing about if it happens.
      console.error("Failed to delete Supabase Auth account for", user.id, error);
    }
  }

  await supabase.auth.signOut();

  return { ok: true, authAccountRemoved };
}
