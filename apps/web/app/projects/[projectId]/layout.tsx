import Link from "next/link";
import { ArrowLeft, BookOpen } from "lucide-react";

import { getProjectMeta } from "@/lib/actions/manuscript";
import { ProjectNavTabs } from "@/components/manuscript/ProjectNavTabs";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProjectMeta(projectId);

  return (
    <div className="flex h-screen flex-col">
      <header className="relative flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Link
          href="/library"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <BookOpen className="size-4" />
        </div>
        <p className="truncate font-display text-base font-semibold">{project.title}</p>
        <ProjectNavTabs projectId={project.id} />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-primary/40 via-accent/40 to-transparent" />
      </header>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
