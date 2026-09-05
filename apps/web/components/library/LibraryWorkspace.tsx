"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutGrid, Table2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { daysRemaining, progressPercent, wordsPerDayNeeded } from "@/lib/writing-progress";
import { CoverUploadButton } from "@/components/library/CoverUploadButton";

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

export interface LibraryProject {
  id: string;
  title: string;
  status: string;
  genres: string[];
  targetWordCount: number | null;
  currentWordCount: number;
  deadline: Date | string | null;
  coverImageUrl: string | null;
}

type View = "shelf" | "progress";

export function LibraryWorkspace({ projects }: { projects: LibraryProject[] }) {
  const [view, setView] = useState<View>("shelf");
  // Optimistic cover updates -- so a just-uploaded cover shows immediately
  // rather than waiting on a full server round-trip.
  const [coverOverrides, setCoverOverrides] = useState<Record<string, string>>({});

  const withCovers = projects.map((project) =>
    coverOverrides[project.id] ? { ...project, coverImageUrl: coverOverrides[project.id] } : project
  );

  return (
    <div>
      <div className="mb-6 flex w-fit items-center gap-1 rounded-full border border-border bg-background p-1">
        <ViewButton active={view === "shelf"} onClick={() => setView("shelf")} icon={LayoutGrid} label="Shelf" />
        <ViewButton active={view === "progress"} onClick={() => setView("progress")} icon={Table2} label="Progress" />
      </div>

      {view === "shelf" ? (
        <ShelfView
          projects={withCovers}
          onCoverChange={(id, url) => setCoverOverrides((prev) => ({ ...prev, [id]: url }))}
        />
      ) : (
        <ProgressView projects={withCovers} />
      )}
    </div>
  );
}

function ViewButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ElementType;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function ShelfView({
  projects,
  onCoverChange,
}: {
  projects: LibraryProject[];
  onCoverChange: (projectId: string, url: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => {
        const progress = progressPercent(project.currentWordCount, project.targetWordCount);

        return (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-md">
              <CoverUploadButton
                projectId={project.id}
                coverImageUrl={project.coverImageUrl}
                onCoverChange={(url) => onCoverChange(project.id, url)}
                className="aspect-[2/3] w-full"
              />

              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg font-semibold leading-tight">{project.title}</p>
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
                    <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                  </div>
                )}
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function ProgressView({ projects }: { projects: LibraryProject[] }) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-3">Title</th>
            <th className="px-4 py-3">Goal</th>
            <th className="px-4 py-3">Words written</th>
            <th className="px-4 py-3">Progress</th>
            <th className="px-4 py-3">Deadline</th>
            <th className="px-4 py-3">Days left</th>
            <th className="px-4 py-3">Words/day needed</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project) => {
            const progress = progressPercent(project.currentWordCount, project.targetWordCount);
            const remaining = daysRemaining(project.deadline);
            const perDay = wordsPerDayNeeded(project.currentWordCount, project.targetWordCount, project.deadline);

            return (
              <tr key={project.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <Link href={`/projects/${project.id}`} className="font-medium hover:underline">
                    {project.title}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {project.targetWordCount ? project.targetWordCount.toLocaleString() : "--"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{project.currentWordCount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  {progress !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground">{progress}%</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">--</span>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {project.deadline ? new Date(project.deadline).toLocaleDateString() : "--"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {remaining === null ? "--" : remaining < 0 ? "Past due" : remaining}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {perDay !== null ? perDay.toLocaleString() : "--"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
