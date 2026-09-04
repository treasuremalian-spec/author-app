"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@author-app/database";

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const displayName = String(formData.get("displayName") || "").trim();
  const username = String(formData.get("username") || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  const bio = String(formData.get("bio") || "").trim() || null;
  const genres = String(formData.get("genres") || "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);

  if (!displayName || !username) {
    redirect(`/onboarding?error=${encodeURIComponent("Display name and username are required.")}`);
  }

  await prisma.user.upsert({
    where: { id: user.id },
    create: { id: user.id, email: user.email ?? "" },
    update: { email: user.email ?? "" },
  });

  await prisma.authorProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, displayName, username, bio, genres },
    update: { displayName, username, bio, genres },
  });

  redirect("/library");
}
