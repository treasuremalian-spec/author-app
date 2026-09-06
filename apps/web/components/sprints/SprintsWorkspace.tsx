"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Users, Globe, Loader2 } from "lucide-react";

import { listPublicSprints, listMySprints, joinSprint, type SprintListItem } from "@/lib/actions/sprints";
import type { FriendItem } from "@/lib/actions/friends";
import { CreateSprintDialog } from "@/components/sprints/CreateSprintDialog";
import { Button } from "@/components/ui/button";

const POLL_MS = 15 * 1000;

function SprintCard({
  sprint,
  onJoin,
  joining,
}: {
  sprint: SprintListItem;
  onJoin: (id: string) => void;
  joining: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{sprint.creatorDisplayName}&rsquo;s sprint</p>
        <p className="text-xs text-muted-foreground">
          {sprint.durationMinutes} min
          {sprint.wordGoal ? ` · goal ${sprint.wordGoal.toLocaleString()} words` : ""}
          {" · "}
          {sprint.participantCount} joined
          {sprint.status === "ACTIVE" ? " · in progress" : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {sprint.isParticipant || sprint.status === "ACTIVE" ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/sprints/${sprint.id}`}>
              {sprint.status === "ACTIVE" ? "Watch" : "Open"}
            </Link>
          </Button>
        ) : (
          <Button size="sm" disabled={joining} onClick={() => onJoin(sprint.id)}>
            {joining && <Loader2 className="size-3.5 animate-spin" />}
            Join
          </Button>
        )}
      </div>
    </li>
  );
}

interface SprintsWorkspaceProps {
  initialMySprints: SprintListItem[];
  initialPublicSprints: SprintListItem[];
  friends: FriendItem[];
}

export function SprintsWorkspace({ initialMySprints, initialPublicSprints, friends }: SprintsWorkspaceProps) {
  const [mySprints, setMySprints] = useState(initialMySprints);
  const [publicSprints, setPublicSprints] = useState(initialPublicSprints);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [mine, pub] = await Promise.all([listMySprints(), listPublicSprints()]);
    setMySprints(mine);
    setPublicSprints(pub);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleJoin(sprintId: string) {
    setJoiningId(sprintId);
    try {
      await joinSprint(sprintId);
      await refresh();
    } finally {
      setJoiningId(null);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div />
        <CreateSprintDialog friends={friends} />
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <Users className="size-4" />
          Your sprints
        </h2>
        {mySprints.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sprints yet -- start one above, or join a public one below.
          </p>
        ) : (
          <ul className="space-y-2">
            {mySprints.map((s) => (
              <SprintCard key={s.id} sprint={s} onJoin={handleJoin} joining={joiningId === s.id} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <Globe className="size-4" />
          Public sprints
        </h2>
        {publicSprints.length === 0 ? (
          <p className="text-sm text-muted-foreground">No public sprints open right now.</p>
        ) : (
          <ul className="space-y-2">
            {publicSprints.map((s) => (
              <SprintCard key={s.id} sprint={s} onJoin={handleJoin} joining={joiningId === s.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
