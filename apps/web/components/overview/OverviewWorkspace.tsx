"use client";

import { useState } from "react";

import { BookDetailsPanel } from "./BookDetailsPanel";
import { ProgressDashboard } from "./ProgressDashboard";
import { ActionItemsBoard } from "./ActionItemsBoard";
import { ExportCard } from "./ExportCard";
import type { ActionItemRow, ProjectDetails } from "@/lib/actions/overview";

export function OverviewWorkspace({
  projectId,
  initialDetails,
  initialActionItems,
}: {
  projectId: string;
  initialDetails: ProjectDetails;
  initialActionItems: ActionItemRow[];
}) {
  const [details, setDetails] = useState<ProjectDetails>(initialDetails);

  function handleChange(patch: Partial<ProjectDetails>) {
    setDetails((prev) => ({ ...prev, ...patch }));
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="mx-auto max-w-4xl space-y-5 px-6 py-8">
        <ProgressDashboard details={details} />
        <ExportCard projectId={projectId} />
        <BookDetailsPanel projectId={projectId} details={details} onChange={handleChange} />
        <ActionItemsBoard projectId={projectId} initialItems={initialActionItems} />
      </div>
    </div>
  );
}
