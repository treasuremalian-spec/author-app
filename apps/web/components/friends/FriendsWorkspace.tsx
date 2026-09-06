"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, UserPlus, Check, X, UserMinus, Loader2 } from "lucide-react";

import {
  searchAuthors,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  listFriends,
  listPendingRequests,
  type AuthorSearchResult,
  type FriendItem,
  type PendingRequestItem,
} from "@/lib/actions/friends";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const POLL_MS = 20 * 1000;
const SEARCH_DEBOUNCE_MS = 350;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function AuthorAvatar({ avatarUrl, name, size = "size-9" }: { avatarUrl: string | null; name: string; size?: string }) {
  return (
    <div className={`${size} shrink-0 overflow-hidden rounded-full bg-secondary`}>
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not a local/optimizable asset
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-muted-foreground">
          {initials(name)}
        </div>
      )}
    </div>
  );
}

interface FriendsWorkspaceProps {
  initialFriends: FriendItem[];
  initialIncoming: PendingRequestItem[];
  initialOutgoing: PendingRequestItem[];
}

export function FriendsWorkspace({ initialFriends, initialIncoming, initialOutgoing }: FriendsWorkspaceProps) {
  const [friends, setFriends] = useState(initialFriends);
  const [incoming, setIncoming] = useState(initialIncoming);
  const [outgoing, setOutgoing] = useState(initialOutgoing);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AuthorSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const [f, p] = await Promise.all([listFriends(), listPendingRequests()]);
    setFriends(f);
    setIncoming(p.incoming);
    setOutgoing(p.outgoing);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (trimmedQuery.length < 2) {
      // Nothing to search -- let the debounce timer's cleanup below handle
      // canceling any in-flight search; the render below already hides
      // stale results once the query is too short, so there's no need to
      // clear `results`/`searching` synchronously here.
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await searchAuthors(trimmedQuery);
      setResults(found);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);
    debounceRef.current = timer;
    return () => clearTimeout(timer);
  }, [trimmedQuery]);

  async function withPending(key: string, fn: () => Promise<void>) {
    setPendingAction(key);
    try {
      await fn();
      await refresh();
      // Re-run the current search too, so a just-sent request's button
      // updates from "Add friend" to "Requested" without the person
      // having to retype their search.
      if (query.trim().length >= 2) {
        const found = await searchAuthors(query.trim());
        setResults(found);
      }
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="grid gap-8 md:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-8">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Find writers</h2>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by username or name..."
              className="pl-9"
            />
          </div>

          {searching && <p className="mt-3 text-sm text-muted-foreground">Searching...</p>}

          {!searching && trimmedQuery.length >= 2 && results.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">No writers found for &ldquo;{query}&rdquo;.</p>
          )}

          <ul className="mt-3 space-y-2">
            {(trimmedQuery.length >= 2 ? results : []).map((r) => (
              <li
                key={r.userId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <AuthorAvatar avatarUrl={r.avatarUrl} name={r.displayName} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">@{r.username}</p>
                  </div>
                </div>
                {r.relationship === "friends" && (
                  <span className="shrink-0 text-xs text-muted-foreground">Friends</span>
                )}
                {r.relationship === "pending_sent" && (
                  <span className="shrink-0 text-xs text-muted-foreground">Requested</span>
                )}
                {r.relationship === "pending_received" && (
                  <span className="shrink-0 text-xs text-muted-foreground">Check your requests</span>
                )}
                {r.relationship === "none" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={pendingAction === `send-${r.userId}`}
                    onClick={() => void withPending(`send-${r.userId}`, () => sendFriendRequest(r.userId))}
                  >
                    {pendingAction === `send-${r.userId}` ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <UserPlus className="size-3.5" />
                    )}
                    Add friend
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Your friends ({friends.length})</h2>
          {friends.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No friends yet -- search above to find other writers on Author App.
            </p>
          ) : (
            <ul className="space-y-2">
              {friends.map((f) => (
                <li
                  key={f.friendshipId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AuthorAvatar avatarUrl={f.avatarUrl} name={f.displayName} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">@{f.username}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <PresenceDot presence={f.presence} showLabel />
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Remove friend"
                      aria-label="Remove friend"
                      disabled={pendingAction === `remove-${f.friendshipId}`}
                      onClick={() => void withPending(`remove-${f.friendshipId}`, () => removeFriend(f.friendshipId))}
                    >
                      {pendingAction === `remove-${f.friendshipId}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <UserMinus className="size-3.5" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="space-y-6">
        <section>
          <h2 className="mb-3 font-display text-base font-semibold">
            Requests{incoming.length > 0 ? ` (${incoming.length})` : ""}
          </h2>
          {incoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending requests.</p>
          ) : (
            <ul className="space-y-2">
              {incoming.map((r) => (
                <li key={r.friendshipId} className="rounded-lg border border-border bg-background p-3">
                  <div className="flex items-center gap-3">
                    <AuthorAvatar avatarUrl={r.avatarUrl} name={r.displayName} size="size-8" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">@{r.username}</p>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      disabled={pendingAction === `accept-${r.friendshipId}`}
                      onClick={() => void withPending(`accept-${r.friendshipId}`, () => acceptFriendRequest(r.friendshipId))}
                    >
                      {pendingAction === `accept-${r.friendshipId}` ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Check className="size-3.5" />
                      )}
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pendingAction === `decline-${r.friendshipId}`}
                      onClick={() => void withPending(`decline-${r.friendshipId}`, () => declineFriendRequest(r.friendshipId))}
                    >
                      <X className="size-3.5" />
                      Decline
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {outgoing.length > 0 && (
          <section>
            <h2 className="mb-3 font-display text-base font-semibold">Sent</h2>
            <ul className="space-y-2">
              {outgoing.map((r) => (
                <li
                  key={r.friendshipId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <AuthorAvatar avatarUrl={r.avatarUrl} name={r.displayName} size="size-8" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">@{r.username}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">Pending</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>
    </div>
  );
}
