import Link from "next/link";
import { BookOpen } from "lucide-react";

import { listProjectsWithStats } from "@/lib/actions/manuscript";
import { signOut } from "@/lib/actions/auth";
import { NewProjectDialog } from "@/components/manuscript/NewProjectDialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const STATUS_LABEL: Record<string, string> = {
  IDEA: "Idea",
  PLANNING: "Planning",
  DRAFTING: "Drafting",
  REVISING: "Revising",
  EDITING: "Editing",
  FORMATTING: "Formatting",
  COMPLETED: "Completed",
  PUBLISHED: "Published",
  ARCHIVED: "Archived",
};

export default async function LibraryPage() {
  const projects = await listProjectsWithStats();

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="flex items-center justify-between border-b border-border bg-background px-6 py-4">
        <div>
          <p className="font-display text-lg font-semibold">Your library</p>
          <p className="text-sm text-muted-foreground">Every book, all in one place.</p>
        </div>
        <div className="flex items-center gap-3">
          <NewProjectDialog />
          <form action={signOut}>
            <Button variant="ghost" type="submit" size="sm">
              Log out
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-background py-24 text-center">
            <BookOpen className="size-10 text-muted-foreground" />
            <div>
              <p className="font-display text-xl font-semibold">Your shelf is empty -- for now</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start your first book and this is where it&rsquo;ll live.
              </p>
            </div>
            <NewProjectDialog />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => {
              const progress =
                project.targetWordCount && project.targetWordCount > 0
                  ? Math.min(100, Math.round((project.currentWordCount / project.targetWordCount) * 100))
                  : null;

              return (
                <Link key={project.id} href={`/projects/${project.id}`}>
                  <Card className="flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-md">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-lg font-semibold leading-tight">
                        {project.title}
                      </p>
                      <span className="shrink-0 rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                        {STATUS_LABEL[project.status] ?? project.status}
                      </span>
                    </div>

                    {project.genres.length > 0 && (
                      <p className="text-xs text-muted-foreground">{project.genres.join(" · ")}</p>
                    )}

                    <div className="mt-auto space-y-1.5">
                      <p className="text-sm text-muted-foreground">
                        {project.currentWordCount.toLocaleString()} words
                        {project.targetWordCount ? ` of ${project.targetWordCount.toLocaleString()}` : ""}
                      </p>
                      {progress !== null && (
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
