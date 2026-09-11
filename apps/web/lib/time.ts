// Small, shared date-formatting helpers -- kept dependency-free (no "use
// server"/"use client") so they're safe to import from either a server
// component (e.g. the library page) or a client component (e.g.
// SceneInspector's version history).

/** "3h ago" / "2d ago" style relative time, for anything recent -- scene
 * save history, a book's last writing activity. Deliberately caps out at
 * days (no weeks/months/years) since every current use case is either
 * very recent (version history) or already has its own "no activity yet"
 * fallback for anything older. */
export function timeAgo(date: string | Date): string {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
