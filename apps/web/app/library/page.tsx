import Link from "next/link";
import { BookOpen, Users, Timer } from "lucide-react";

import { listProjectsWithStats } from "@/lib/actions/manuscript";
import { getMyProfile } from "@/lib/actions/profile";
import { NewProjectDialog } from "@/components/manuscript/NewProjectDialog";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { ProfileMenu } from "@/components/profile/ProfileMenu";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";

export default async function LibraryPage() {
  const [projects, { profile }] = await Promise.all([listProjectsWithStats(), getMyProfile()]);

  return (
    <div className="min-h-screen">
      <PresenceHeartbeat />
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-5">
        <div>
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Author App
          </span>
          <p className="font-display text-2xl italic">Your library</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/sprints"
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Timer className="size-4" />
            Sprints
          </Link>
          <Link
            href="/friends"
            className="flex items-center gap-1.5 px-3 py-2 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:text-foreground"
          >
            <Users className="size-4" />
            Friends
          </Link>
          <NewProjectDialog />
          {profile && (
            <ProfileMenu
              displayName={profile.displayName}
              username={profile.username}
              avatarUrl={profile.avatarUrl}
            />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-4 border border-dashed border-border py-24 text-center">
            <BookOpen className="size-10 text-muted-foreground" strokeWidth={1} />
            <div>
              <p className="font-display text-2xl italic">Your shelf is empty -- for now</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start your first book and this is where it&rsquo;ll live.
              </p>
            </div>
            <NewProjectDialog />
          </div>
        ) : (
          <LibraryWorkspace projects={projects} />
        )}
      </main>
    </div>
  );
}
