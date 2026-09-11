import Link from "next/link";
import { ArrowRight, BookOpen, Timer, Users } from "lucide-react";

import { listProjectsWithStats } from "@/lib/actions/manuscript";
import { getMyProfile } from "@/lib/actions/profile";
import { NewProjectDialog } from "@/components/manuscript/NewProjectDialog";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { ProfileMenu } from "@/components/profile/ProfileMenu";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";
import { daysRemaining } from "@/lib/writing-progress";
import { timeAgo } from "@/lib/time";

export default async function LibraryPage() {
  const [projects, { profile }] = await Promise.all([listProjectsWithStats(), getMyProfile()]);

  const totalWords = projects.reduce((sum, p) => sum + p.currentWordCount, 0);

  // Soonest upcoming (not-yet-past) deadline across the whole shelf, for
  // the stats strip -- a project with no deadline set never surfaces here.
  const closestDeadline = projects
    .filter((p) => p.deadline)
    .map((p) => ({ project: p, remaining: daysRemaining(p.deadline) }))
    .filter((x): x is { project: (typeof projects)[number]; remaining: number } => x.remaining !== null && x.remaining >= 0)
    .sort((a, b) => a.remaining - b.remaining)[0];

  // Whichever book had the most recent scene.updatedAt anywhere in it --
  // powers the "Continue writing" callout below. Null for a brand-new
  // library with no written scenes anywhere yet.
  const mostRecent = projects
    .filter((p) => p.lastActivityAt)
    .sort((a, b) => new Date(b.lastActivityAt!).getTime() - new Date(a.lastActivityAt!).getTime())[0];

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
          <>
            {mostRecent && (
              <Link
                href={`/projects/${mostRecent.id}`}
                className="mb-4 flex items-center gap-4 border border-border bg-card p-4 transition-colors hover:border-foreground"
              >
                <div className="flex size-11 shrink-0 items-center justify-center border border-border text-foreground">
                  <BookOpen className="size-4" strokeWidth={1.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                    Continue writing
                  </p>
                  <p className="truncate font-display text-lg italic">{mostRecent.title}</p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {timeAgo(mostRecent.lastActivityAt!)}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )}

            <div className="mb-8 flex flex-wrap gap-6 border-b border-border pb-6 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              <span>
                <span className="text-foreground">{projects.length}</span> {projects.length === 1 ? "book" : "books"}{" "}
                on your shelf
              </span>
              <span>
                <span className="text-foreground">{totalWords.toLocaleString()}</span> words across your library
              </span>
              {closestDeadline && (
                <span className="truncate">
                  Closest deadline:{" "}
                  <span className="text-foreground">{closestDeadline.project.title}</span> in{" "}
                  <span className="text-foreground">{closestDeadline.remaining}</span>{" "}
                  {closestDeadline.remaining === 1 ? "day" : "days"}
                </span>
              )}
            </div>

            <LibraryWorkspace projects={projects} />
          </>
        )}
      </main>
    </div>
  );
}
