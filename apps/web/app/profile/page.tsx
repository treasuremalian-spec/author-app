import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { getMyProfile } from "@/lib/actions/profile";
import { ProfileForm } from "@/components/profile/ProfileForm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const params = await searchParams;
  const { profile } = await getMyProfile();

  if (!profile) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen bg-muted/30 px-6 py-10">
      <div className="mx-auto max-w-lg">
        <Link
          href="/library"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to your library
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Your profile</CardTitle>
            <CardDescription>This is how other writers will see you.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm
              displayName={profile.displayName}
              username={profile.username}
              bio={profile.bio ?? ""}
              genres={profile.genres}
              avatarUrl={profile.avatarUrl}
              error={params.error}
              saved={params.saved === "1"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
