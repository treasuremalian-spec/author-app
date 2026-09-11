"use client";

import { useMemo, useState } from "react";
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

const SORT_LABEL = {
  activity: "Last edited",
  deadline: "Deadline",
  title: "Title A–Z",
  progress: "Progress",
} as const;

type SortKey = keyof typeof SORT_LABEL;

export interface LibraryProject {
  id: string;
  title: string;
  status: string;
  genres: string[];
  targetWordCount: number | null;
  currentWordCount: number;
  deadline: Date | string | null;
  coverImageUrl: string | null;
  // Most recent scene.updatedAt anywhere in the book (see
  // listProjectsWithStats) -- null for a book with no written scenes yet.
  // Powers the "Last edited" sort here.
  lastActivityAt: Date | string | null;
}

type View = "shelf" | "progress";

function sortProjects(projects: LibraryProject[], sort: SortKey): LibraryProject[] {
  const sorted = [...projects];
  switch (sort) {
    case "activity":
      // No-activity-yet books sink to the bottom rather than clustering at
      // an arbitrary "oldest" position.
      return sorted.sort((a, b) => {
        const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : -Infinity;
        const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : -Infinity;
        return bt - at;
      });
    case "deadline":
      // Soonest deadline first; no-deadline books sink to the bottom.
      return sorted.sort((a, b) => {
        const ar = daysRemaining(a.deadline);
        const br = daysRemaining(b.deadline);
        if (ar === null && br === null) return 0;
        if (ar === null) return 1;
        if (br === null) return -1;
        return ar - br;
      });
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title));
    case "progress": {
      // Highest percent-complete first; books with no target (so no
      // percent to show) sink to the bottom.
      return sorted.sort((a, b) => {
        const ap = progressPercent(a.currentWordCount, a.targetWordCount);
        const bp = progressPercent(b.currentWordCount, b.targetWordCount);
        if (ap === null && bp === null) return 0;
        if (ap === null) return 1;
        if (bp === null) return -1;
        return bp - ap;
      });
    }
  }
}

export function LibraryWorkspace({ projects }: { projects: LibraryProject[] }) {
  const [view, setView] = useState<View>("shelf");
  const [sort, setSort] = useState<SortKey>("activity");
  // Empty set == no filter, show every status -- avoids the awkward "every
  // box checked" starting state a real multi-select would otherwise need.
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  // Optimistic cover updates -- so a just-uploaded cover shows immediately
  // rather than waiting on a full server round-trip.
  const [coverOverrides, setCoverOverrides] = useState<Record<string, string>>({});

  const withCovers = projects.map((project) =>
    coverOverrides[project.id] ? { ...project, coverImageUrl: coverOverrides[project.id] } : project
  );

  const statusesPresent = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status))).sort((a, b) => a.localeCompare(b)),
    [projects]
  );

  const filtered =
    statusFilter.size === 0 ? withCovers : withCovers.filter((p) => statusFilter.has(p.status));
  const visible = sortProjects(filtered, sort);

  function toggleStatus(status: string) {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex w-fit items-center gap-1 rounded-full border border-border bg-background p-1">
          <ViewButton active={view === "shelf"} onClick={() => setView("shelf")} icon={LayoutGrid} label="Shelf" />
          <ViewButton
            active={view === "progress"}
            onClick={() => setView("progress")}
            icon={Table2}
            label="Progress"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {statusesPresent.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {statusesPresent.map((status) => {
                const active = statusFilter.has(status);
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggleStatus(status)}
                    className={cn(
                      "border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] transition-colors",
                      active
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {STATUS_LABEL[status] ?? status}
                  </button>
                );
              })}
            </div>
          )}

          <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="h-7 border border-input bg-background px-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <option key={key} value={key}>
                  {SORT_LABEL[key]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
          No books match that filter.
        </p>
      ) : view === "shelf" ? (
        <ShelfView
          projects={visible}
          onCoverChange={(id, url) => setCoverOverrides((prev) => ({ ...prev, [id]: url }))}
        />
      ) : (
        <ProgressView projects={visible} />
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
            <Card className="flex h-full flex-col gap-3 p-5 shadow-none transition-colors hover:border-foreground">
              <CoverUploadButton
                projectId={project.id}
                coverImageUrl={project.coverImageUrl}
                onCoverChange={(url) => onCoverChange(project.id, url)}
                className="aspect-[2/3] w-full"
              />

              <div className="flex items-start justify-between gap-2">
                <p className="font-display text-lg italic leading-tight">{project.title}</p>
                <span className="shrink-0 border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
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
    <Card className="overflow-x-auto p-0 shadow-none">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
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
