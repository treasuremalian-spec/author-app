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
