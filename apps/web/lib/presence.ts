// Shared presence logic -- pure functions, no server/DB access, so this
// can be imported from both server actions and client components.
//
// AuthorProfile.presenceStatus is a plain DB column (not a live socket),
// kept fresh by a heartbeat (see components/presence/PresenceHeartbeat.tsx)
// that re-touches presenceUpdatedAt every ~60s while a tab is open, plus
// specific transitions (entering the editor -> WRITING, joining an active
// sprint -> SPRINTING). Friend lists poll every ~20s (see FriendsWorkspace/
// SprintRoom) rather than subscribing to a push channel -- "live enough"
// for a small circle of friends, and considerably simpler than wiring up
// Supabase Realtime channels; worth revisiting if the friend list ever
// grows large enough for polling to feel stale.
//
// Because there's no reliable "tab closed" signal without that same
// realtime machinery, staleness is what actually decides whether someone
// reads as online: if presenceUpdatedAt is older than PRESENCE_FRESH_MS,
// they're shown as offline no matter what presenceStatus says.
export const PRESENCE_FRESH_MS = 3 * 60 * 1000; // 3 minutes

export type EffectivePresence = "online" | "writing" | "sprinting" | "busy" | "offline";

export function effectivePresence(
  presenceStatus: string,
  presenceUpdatedAt: Date | string | null,
  now: Date = new Date()
): EffectivePresence {
  if (!presenceUpdatedAt) return "offline";
  const updatedAt = typeof presenceUpdatedAt === "string" ? new Date(presenceUpdatedAt) : presenceUpdatedAt;
  const isFresh = now.getTime() - updatedAt.getTime() < PRESENCE_FRESH_MS;
  if (!isFresh) return "offline";

  switch (presenceStatus) {
    case "WRITING":
      return "writing";
    case "SPRINTING":
      return "sprinting";
    case "BUSY":
      return "busy";
    case "ONLINE":
      return "online";
    default:
      return "offline"; // INVISIBLE, or anything unrecognized
  }
}

export const PRESENCE_LABEL: Record<EffectivePresence, string> = {
  online: "Online",
  writing: "Writing",
  sprinting: "Sprinting",
  busy: "Busy",
  offline: "Offline",
};

export const PRESENCE_DOT_CLASS: Record<EffectivePresence, string> = {
  online: "bg-emerald-500",
  writing: "bg-blue-500",
  sprinting: "bg-violet-500",
  busy: "bg-amber-500",
  offline: "bg-muted-foreground/30",
};
