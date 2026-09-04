import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@author-app/database";
import { completeOnboarding } from "@/lib/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  // Safety net: if this writer already has a profile (e.g. they navigated
  // back to this page manually), don't make them redo it -- just send them
  // on to their library.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const existingProfile = await prisma.authorProfile.findUnique({
      where: { userId: user.id },
      select: { userId: true },
    });
    if (existingProfile) {
      redirect("/library");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-6 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Set up your author profile</CardTitle>
          <CardDescription>
            This is how other writers in your circle will see you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={completeOnboarding} className="space-y-4">
            {params.error && (
              <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {params.error}
              </p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="displayName">Display name</Label>
              <Input id="displayName" name="displayName" required placeholder="Tasia" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="username">Username</Label>
              <Input id="username" name="username" required placeholder="thatgirltasia" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="genres">Genres you write (comma-separated)</Label>
              <Input id="genres" name="genres" placeholder="Urban fiction, Dark romance" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Short bio</Label>
              <Textarea id="bio" name="bio" rows={4} placeholder="Tell your writing circle a little about you and what you write." />
            </div>
            <Button type="submit" className="w-full">
              Enter my workspace
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
