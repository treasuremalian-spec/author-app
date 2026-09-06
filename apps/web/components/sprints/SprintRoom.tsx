"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Trophy, Loader2 } from "lucide-react";

import {
  getSprintDetail,
  startSprint,
  joinSprint,
  leaveSprint,
  cancelSprint,
  type SprintDetail,
} from "@/lib/actions/sprints";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { Button } from "@/components/ui/button";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return (
    <div className="size-9 shrink-0 overflow-hidden rounded-full bg-secondary">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not a local/optimizable asset
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
          {initials(name)}
        </div>
      )}
    </div>
  );
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function SprintRoom({ sprintId, initialSprint }: { sprintId: string; initialSprint: SprintDetail }) {
  const router = useRouter();
  const [sprint, setSprint] = useState(initialSprint);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const fresh = await getSprintDetail(sprintId);
    if (fresh) setSprint(fresh);
  }, [sprintId]);

  // Tick every second for the countdown display.
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  // Poll the server -- faster while a sprint is actually running, since
  // that's when word counts and the eventual COMPLETED transition matter
  // most; slower in the waiting room.
  useEffect(() => {
    if (sprint.status === "COMPLETED" || sprint.status === "CANCELED") return;
    const pollMs = sprint.status === "ACTIVE" ? 5000 : 10000;
    const interval = setInterval(() => void refresh(), pollMs);
    return () => clearInterval(interval);
  }, [sprint.status, refresh]);

  const msRemaining = useMemo(() => {
    if (sprint.status !== "ACTIVE" || !sprint.endsAt) return null;
    return new Date(sprint.endsAt).getTime() - now;
  }, [sprint.status, sprint.endsAt, now]);

  // The clock can run out client-side before the next poll confirms it
  // server-side -- re-fetch right at zero so the room flips to results
  // promptly instead of sitting at 0:00. Deferred via setTimeout (rather
  // than calling refresh() directly in the effect body) so the fetch-then-
  // setState isn't mistaken for a synchronous state update during render.
  useEffect(() => {
    if (msRemaining === null || msRemaining > 0) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [msRemaining, refresh]);

  async function withBusy(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background p-6 text-center">
        {sprint.status === "SCHEDULED" && (
          <>
            <p className="text-sm text-muted-foreground">Waiting room</p>
            <p className="mt-1 font-display text-3xl font-semibold">{sprint.durationMinutes} minutes</p>
            {sprint.wordGoal && (
              <p className="mt-1 text-sm text-muted-foreground">Goal: {sprint.wordGoal.toLocaleString()} words</p>
            )}
            <div className="mt-4 flex justify-center gap-2">
              {sprint.isCreator ? (
                <>
                  <Button disabled={busy} onClick={() => void withBusy(() => startSprint(sprintId))}>
                    {busy && <Loader2 className="size-4 animate-spin" />}
                    Start sprint
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void withBusy(() => cancelSprint(sprintId))}>
                    Cancel
                  </Button>
                </>
              ) : sprint.isParticipant ? (
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void withBusy(() => leaveSprint(sprintId)).then(() => router.push("/sprints"))}
                >
                  Leave sprint
                </Button>
              ) : (
                <Button disabled={busy} onClick={() => void withBusy(() => joinSprint(sprintId))}>
                  {busy && <Loader2 className="size-4 animate-spin" />}
                  Join sprint
                </Button>
              )}
            </div>
          </>
        )}

        {sprint.status === "ACTIVE" && msRemaining !== null && (
          <>
            <p className="text-sm text-muted-foreground">Time remaining</p>
            <p className="mt-1 font-display text-5xl font-semibold tabular-nums">{formatCountdown(msRemaining)}</p>
            {sprint.wordGoal && (
              <p className="mt-1 text-sm text-muted-foreground">Goal: {sprint.wordGoal.toLocaleString()} words</p>
            )}
          </>
        )}

        {sprint.status === "COMPLETED" && (
          <>
            <p className="text-sm text-muted-foreground">Sprint complete</p>
            <p className="mt-1 font-display text-2xl font-semibold">Nice work!</p>
          </>
        )}

        {sprint.status === "CANCELED" && <p className="text-sm text-muted-foreground">This sprint was canceled.</p>}
      </div>

      <div>
        <h2 className="mb-3 font-display text-base font-semibold">
          {sprint.status === "COMPLETED" ? "Results" : "Sprinting"} ({sprint.participants.length})
        </h2>
        <ul className="space-y-2">
          {sprint.participants.map((p, i) => (
            <li
              key={p.userId}
              className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                {sprint.status === "COMPLETED" && i === 0 && p.wordsWritten > 0 ? (
                  <Trophy className="size-4 shrink-0 text-amber-500" />
                ) : (
                  <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                )}
                <Avatar url={p.avatarUrl} name={p.displayName} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.displayName}</p>
                  {sprint.status !== "COMPLETED" && <PresenceDot presence={p.presence} showLabel />}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-semibold tabular-nums">{p.wordsWritten.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">words</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
