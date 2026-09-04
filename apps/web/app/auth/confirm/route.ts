// Handles the link from the "confirm your email" message Supabase sends
// after sign-up.
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@author-app/database";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  if (token_hash && type) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const userId = data.user?.id;
      const existingProfile = userId
        ? await prisma.authorProfile.findUnique({ where: { userId }, select: { userId: true } })
        : null;
      redirect(existingProfile ? "/library" : "/onboarding");
    }
  }

  redirect("/login?error=Could not confirm your email. Please try again.");
}
