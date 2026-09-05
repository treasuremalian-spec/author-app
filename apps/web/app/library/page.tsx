import { BookOpen } from "lucide-react";

import { listProjectsWithStats } from "@/lib/actions/manuscript";
import { signOut } from "@/lib/actions/auth";
import { NewProjectDialog } from "@/components/manuscript/NewProjectDialog";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { Button } from "@/components/ui/button";

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
          <LibraryWorkspace projects={projects} />
        )}
      </main>
    </div>
  );
}
