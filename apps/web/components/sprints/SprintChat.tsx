"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Loader2 } from "lucide-react";

import { listSprintMessages, sendSprintMessage, type SprintMessageView } from "@/lib/actions/sprints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const POLL_MS = 4000;

/** A sprint's own scoped chat -- only rendered for a sprint's own
 * participants (see SprintRoom.tsx), and the server actions this calls
 * enforce that same check independently (see assertParticipant() in
 * lib/actions/sprints.ts), so this is defense in depth, not the only
 * gate. Polls rather than pushes, consistent with the rest of this
 * room -- see the presence commit's note on why that trade-off was made
 * for now. */
export function SprintChat({ sprintId }: { sprintId: string }) {
  const [messages, setMessages] = useState<SprintMessageView[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const fresh = await listSprintMessages(sprintId);
      setMessages(fresh);
    } finally {
      setLoaded(true);
    }
  }, [sprintId]);

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  // Keep the latest message in view as new ones arrive (including the
  // sender's own, right after they send it).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;
    setDraft("");
    setSending(true);
    try {
      await sendSprintMessage(sprintId, text);
      await refresh();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-background">
      <div className="border-b border-border px-4 py-2.5">
        <h2 className="font-display text-sm font-semibold">Chat</h2>
      </div>

      <div ref={listRef} className="max-h-56 space-y-2 overflow-y-auto px-4 py-3">
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Loading chat...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet -- say hi!</p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col", m.isMe ? "items-end" : "items-start")}>
              {!m.isMe && <p className="px-1 text-xs font-medium text-muted-foreground">{m.displayName}</p>}
              <p
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-1.5 text-sm break-words",
                  m.isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                )}
              >
                {m.text}
              </p>
            </div>
          ))
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void handleSend();
        }}
        className="flex items-center gap-2 border-t border-border p-2.5"
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Say something..."
          maxLength={1000}
          className="h-9"
        />
        <Button type="submit" size="sm" disabled={sending || !draft.trim()}>
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        </Button>
      </form>
    </div>
  );
}
