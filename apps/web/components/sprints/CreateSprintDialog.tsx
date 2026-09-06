"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";

import { createSprint } from "@/lib/actions/sprints";
import { SPRINT_DURATIONS_MINUTES } from "@/lib/sprint-constants";
import type { FriendItem } from "@/lib/actions/friends";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function CreateSprintDialog({ friends }: { friends: FriendItem[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<number>(25);
  const [wordGoal, setWordGoal] = useState("");
  const [visibility, setVisibility] = useState<"public" | "friends" | "solo">("friends");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  function toggleFriend(userId: string) {
    setSelectedFriendIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const { sprintId } = await createSprint({
        durationMinutes: duration,
        wordGoal: wordGoal ? Number(wordGoal) : null,
        isPublic: visibility === "public",
        inviteFriendUserIds: visibility === "friends" ? selectedFriendIds : [],
      });
      setOpen(false);
      router.push(`/sprints/${sprintId}`);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New sprint
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a writing sprint</DialogTitle>
          <DialogDescription>
            Everyone who joins starts and ends together -- pick a length and who&rsquo;s invited.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Length</Label>
            <div className="flex gap-2">
              {SPRINT_DURATIONS_MINUTES.map((mins) => (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setDuration(mins)}
                  className={cn(
                    "flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors",
                    duration === mins
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  )}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wordGoal">Word goal (optional)</Label>
            <Input
              id="wordGoal"
              type="number"
              min={0}
              value={wordGoal}
              onChange={(e) => setWordGoal(e.target.value)}
              placeholder="e.g. 1000"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Who can join</Label>
            <div className="flex gap-2">
              {(
                [
                  { key: "solo" as const, label: "Just me" },
                  { key: "friends" as const, label: "Invite friends" },
                  { key: "public" as const, label: "Public" },
                ]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setVisibility(opt.key)}
                  className={cn(
                    "flex-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors",
                    visibility === opt.key
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {visibility === "public" && (
              <p className="text-xs text-muted-foreground">
                Any signed-in writer will be able to find and join this sprint.
              </p>
            )}
          </div>

          {visibility === "friends" && (
            <div className="space-y-1.5">
              <Label>Invite</Label>
              {friends.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  You don&rsquo;t have any friends yet -- add some from the Friends page first.
                </p>
              ) : (
                <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
                  {friends.map((f) => (
                    <label
                      key={f.userId}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFriendIds.includes(f.userId)}
                        onChange={() => toggleFriend(f.userId)}
                        className="size-4"
                      />
                      {f.displayName}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button onClick={() => void handleCreate()} disabled={creating}>
            {creating && <Loader2 className="size-4 animate-spin" />}
            Create sprint
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
