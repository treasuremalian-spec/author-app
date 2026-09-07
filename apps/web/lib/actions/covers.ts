"use server";

// Saving a book's cover image URL onto its Project row. The actual file
// upload happens client-side straight to Supabase Storage (see
// CoverUploadButton.tsx) -- this action just persists the resulting public
// URL, the same way every other project field gets saved.
import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";

export async function updateProjectCover(projectId: string, coverImageUrl: string | null) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.project.update({
    where: { id: projectId },
    data: { coverImageUrl },
  });

  revalidatePath("/library");
  revalidatePath(`/projects/${projectId}`);
}

// A book-wide background image for the print PDF only (author request,
// 2026-09-07) -- same save-the-URL-after-a-direct-client-upload pattern as
// the cover above, uploaded to the same "covers" Storage bucket (no new
// bucket/migration needed -- its RLS policy is generic to any file under
// the uploader's own folder prefix, see BackgroundImageUploadButton.tsx).
export async function updateProjectBackgroundImage(projectId: string, backgroundImageUrl: string | null) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.project.update({
    where: { id: projectId },
    data: { backgroundImageUrl },
  });

  revalidatePath(`/projects/${projectId}/format`);
}
