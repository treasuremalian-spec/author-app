"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, Loader2, Timer, Trophy } from "lucide-react";

import {
  getMyCurrentSprint,
  startSprint,
  leaveSprint,
  cancelSprint,
  type SprintDetail,
} from "@/lib/actions/sprints";
import { listFriends, type FriendItem } from "@/lib/actions/friends";
import { CreateSprintDialog } from "@/components/sprints/CreateSprintDialog";
import { SprintChat } from "@/components/sprints/SprintChat";
import { Button } from "@/components/ui/button";

const POLL_ACTIVE_MS = 5000;
const POLL_IDLE_MS = 15000;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/** Sprinting, right where the actual writing happens -- a small floating
 * panel docked to the bottom-right of the editor (Tasia's own ask, after
 * trying the standalone /sprints room and finding there was nowhere to
 * actually write from there). A solo sprint starts immediately with no
 * waiting room; a friends/public sprint still waits for others to join,
 * same as /sprints. Word count keeps coming from the same autosave hook
 * as always (lib/scene-save.ts) -- this panel just surfaces it here
 * instead of requiring a trip to a separate page. /sprints and its room
 * page still exist for browsing public sprints, managing invites, or
 * checking on a sprint without opening the editor -- this panel and that
 * page both just read/write the same sprint, so joining one place is
 * picked up in the other within a poll or two. */
export function SprintPanel({ onActiveChange }: { onActiveChange?: (active: boolean) => void }) {
  const [sprint, setSprint] = useState<SprintDetail | null>(null);
  const [friends, setFriends] = useState<FriendItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const current = await getMyCurrentSprint();
    setSprint((prev) => {
      // getMyCurrentSprint() only ever returns SCHEDULED/ACTIVE sprints, so
      // the poll right after one finishes returns null -- without this
      // guard the just-finished results would flash and vanish before
      // Tasia could see them. She dismisses them explicitly instead.
      if (!current && prev?.status === "COMPLETED") return prev;
      return current;
    });
  }, []);

  useEffect(() => {
    // Deferred via setTimeout (rather than calling these directly in the
    // effect body) so the fetch-then-setState isn't mistaken for a
    // synchronous state update during render -- same fix as SprintRoom.tsx.
    const timer = setTimeout(() => {
      void refresh();
      void listFriends().then(setFriends);
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const interval = setInterval(() => void refresh(), sprint?.status === "ACTIVE" ? POLL_ACTIVE_MS : POLL_IDLE_MS);
    return () => clearInterval(interval);
  }, [refresh, sprint?.status]);

  useEffect(() => {
    if (sprint?.status !== "ACTIVE") return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [sprint?.status]);

  useEffect(() => {
    onActiveChange?.(sprint?.status === "ACTIVE");
  }, [sprint?.status, onActiveChange]);

  const msRemaining = sprint?.status === "ACTIVE" && sprint.endsAt ? new Date(sprint.endsAt).getTime() - now : null;

  async function handleCreated() {
    await refresh();
    setExpanded(true);
  }

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const hasSprint = sprint !== null;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      {expanded ? (
        <div className="overflow-hidden rounded-xl border border-border bg-background shadow-lg">
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left"
          >
            <span className="flex items-center gap-1.5 font-display text-sm font-semibold">
              <Timer className="size-3.5" />
              {sprint?.status === "ACTIVE" && msRemaining !== null
                ? formatCountdown(msRemaining)
                : sprint?.status === "SCHEDULED"
                  ? "Waiting room"
                  : sprint?.status === "COMPLETED"
                    ? "Sprint complete"
                    : "Sprint"}
            </span>
            <ChevronDown className="size-4 text-muted-foreground" />
          </button>

          <div className="max-h-[70vh] overflow-y-auto p-4">
            {!hasSprint && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Race the clock, solo or with friends -- your word count keeps ticking as you write here.
                </p>
                <CreateSprintDialog friends={friends} onCreated={handleCreated} />
              </div>
            )}

            {sprint && sprint.status === "SCHEDULED" && (
              <div className="space-y-3 text-center">
                <p className="font-display text-2xl font-semibold">{sprint.durationMinutes} minutes</p>
                {sprint.wordGoal && (
                  <p className="text-sm text-muted-foreground">Goal: {sprint.wordGoal.toLocaleString()} words</p>
                )}
                <ul className="space-y-1 text-left text-sm text-muted-foreground">
                  {sprint.participants.map((p) => (
                    <li key={p.userId}>{p.displayName}</li>
                  ))}
                </ul>
                <div className="flex justify-center gap-2">
                  {sprint.isCreator ? (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => void withBusy(() => startSprint(sprint.id))}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />}
                        Start
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void withBusy(() => cancelSprint(sprint.id))}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void withBusy(() => leaveSprint(sprint.id))}
                    >
                      Leave
                    </Button>
                  )}
                </div>
                {sprint.participants.length > 1 && <SprintChat sprintId={sprint.id} />}
              </div>
            )}

            {sprint && sprint.status === "ACTIVE" && msRemaining !== null && (
              <div className="space-y-3">
                <div className="text-center">
                  <p className="font-display text-3xl font-semibold tabular-nums">{formatCountdown(msRemaining)}</p>
                  {sprint.wordGoal && (
                    <p className="text-sm text-muted-foreground">Goal: {sprint.wordGoal.toLocaleString()} words</p>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {sprint.participants.map((p) => (
                    <li key={p.userId} className="flex items-center justify-between text-sm">
                      <span className="truncate">{p.displayName}</span>
                      <span className="font-medium tabular-nums">{p.wordsWritten.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                {sprint.participants.length > 1 && <SprintChat sprintId={sprint.id} />}
              </div>
            )}

            {sprint && sprint.status === "COMPLETED" && (
              <div className="space-y-3">
                <ul className="space-y-1.5">
                  {sprint.participants.map((p, i) => (
                    <li key={p.userId} className="flex items-center gap-2 text-sm">
                      {i === 0 && p.wordsWritten > 0 ? (
                        <Trophy className="size-4 shrink-0 text-amber-500" />
                      ) : (
                        <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                      )}
                      <span className="flex-1 truncate">{p.displayName}</span>
                      <span className="font-medium tabular-nums">{p.wordsWritten.toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setSprint(null)}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2.5 text-sm font-medium shadow-lg hover:bg-muted"
        >
          <Timer className="size-4" />
          {sprint?.status === "ACTIVE" && msRemaining !== null
            ? formatCountdown(msRemaining)
            : sprint?.status === "SCHEDULED"
              ? "Waiting..."
              : sprint?.status === "COMPLETED"
                ? "Results"
                : "Sprint"}
        </button>
      )}
    </div>
  );
}
