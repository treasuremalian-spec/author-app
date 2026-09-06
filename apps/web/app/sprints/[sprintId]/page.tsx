import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getSprintDetail } from "@/lib/actions/sprints";
import { SprintRoom } from "@/components/sprints/SprintRoom";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";

export default async function SprintRoomPage({
  params,
}: {
  params: Promise<{ sprintId: string }>;
}) {
  const { sprintId } = await params;
  const sprint = await getSprintDetail(sprintId);

  if (!sprint) notFound();

  return (
    <div className="min-h-screen bg-muted/30 px-6 py-10">
      <PresenceHeartbeat status={sprint.status === "ACTIVE" ? "SPRINTING" : "ONLINE"} />
      <div className="mx-auto max-w-2xl">
        <Link
          href="/sprints"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All sprints
        </Link>

        <SprintRoom sprintId={sprintId} initialSprint={sprint} />
      </div>
    </div>
  );
}
