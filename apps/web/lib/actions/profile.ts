"use server";

// The author's own profile -- what other authors will eventually see (once
// friends/sprints are live), and where they manage their display name,
// avatar, bio, and genres. The avatar file upload itself happens
// client-side straight to Supabase Storage (see AvatarUploadButton.tsx);
// these actions just read/persist the AuthorProfile row, same pattern as
// updateProjectCover in covers.ts.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@author-app/database";
import { requireUser } from "@/lib/actions/shared";

export async function getMyProfile() {
  const user = await requireUser();
  const profile = await prisma.authorProfile.findUnique({ where: { userId: user.id } });
  return { user, profile };
}

export async function updateAvatarUrl(avatarUrl: string | null) {
  const user = await requireUser();
  await prisma.authorProfile.update({
    where: { userId: user.id },
    data: { avatarUrl },
  });
  revalidatePath("/library");
  revalidatePath("/profile");
}

export async function updateMyProfile(formData: FormData) {
  const user = await requireUser();

  const displayName = String(formData.get("displayName") || "").trim();
  const bio = String(formData.get("bio") || "").trim() || null;
  const genres = String(formData.get("genres") || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  if (!displayName) {
    redirect(`/profile?error=${encodeURIComponent("Display name can't be empty.")}`);
  }

  await prisma.authorProfile.update({
    where: { userId: user.id },
    data: { displayName, bio, genres },
  });

  revalidatePath("/library");
  revalidatePath("/profile");
  redirect("/profile?saved=1");
}
