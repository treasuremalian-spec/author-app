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
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
        <Link
          href="/library"
          className="flex size-8 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex size-8 shrink-0 items-center justify-center border border-border text-foreground">
          <BookOpen className="size-4" strokeWidth={1.5} />
        </div>
        <p className="truncate font-display text-base italic">{project.title}</p>
        <ProjectNavTabs projectId={project.id} />
      </header>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
