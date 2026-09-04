"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PrismaClient } from "@author-app/database";

// One shared Prisma connection, reused across requests (the recommended
// pattern in serverless/Next.js environments to avoid exhausting database
// connections).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };
const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

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

  redirect("/dashboard");
}
