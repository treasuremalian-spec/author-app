"use client";

import { useEffect, useRef, useState } from "react";
import { BookMarked, Plus, Trash2 } from "lucide-react";

import {
  createStoryBibleEntry,
  deleteStoryBibleEntry,
  updateStoryBibleEntry,
  type StoryBibleEntryTypeValue,
} from "@/lib/actions/story-bible";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface NoteRow {
  id: string;
  type: StoryBibleEntryTypeValue;
  title: string;
  body: string | null;
}

const SAVE_DELAY_MS = 900;

const TYPE_LABEL: Record<StoryBibleEntryTypeValue, string> = {
  WORLDBUILDING: "Worldbuilding",
  ORGANIZATION: "Organization",
  FAMILY: "Family",
  BUSINESS: "Business",
  OBJECT: "Object",
  TERMINOLOGY: "Terminology",
  RULE: "Rule",
  HISTORICAL_EVENT: "Historical event",
  RESEARCH: "Research",
  FACT: "Fact",
};

export function NotesPanel({
  projectId,
  initialNotes,
}: {
  projectId: string;
  initialNotes: NoteRow[];
}) {
  const [notes, setNotes] = useState<NoteRow[]>(initialNotes);
  const [selectedId, setSelectedId] = useState<string | null>(initialNotes[0]?.id ?? null);

  const selected = notes.find((n) => n.id === selectedId) ?? null;

  async function handleCreate() {
    const created = await createStoryBibleEntry(projectId, "WORLDBUILDING", "New note");
    setNotes((prev) => [created as NoteRow, ...prev]);
    setSelectedId(created.id);
  }

  function handleChange(id: string, patch: Partial<NoteRow>) {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }

  function handleDelete(id: string) {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (selectedId === id) setSelectedId(null);
    deleteStoryBibleEntry(id, projectId).catch(() => {});
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_1fr]">
      <aside className="min-h-0 overflow-y-auto border-r border-border bg-secondary/25 p-3">
        <button
          type="button"
          onClick={handleCreate}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
        >
          <Plus className="size-3.5" /> New note
        </button>

        {notes.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            Nothing here yet -- worldbuilding, rules, research, anything you don&apos;t want to
            forget.
          </p>
        ) : (
          <ul className="space-y-1">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(n.id)}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg border-l-2 px-2 py-2 text-left text-sm transition-colors",
                    n.id === selectedId
                      ? "border-primary bg-primary/15 font-medium text-primary"
                      : "border-transparent hover:bg-background/80"
                  )}
                >
                  <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
                    <BookMarked className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{n.title || "Untitled"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {TYPE_LABEL[n.type]}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="min-h-0 overflow-y-auto bg-muted/20">
        {selected ? (
          <NoteDetail
            key={selected.id}
            note={selected}
            projectId={projectId}
            onChange={handleChange}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Select a note from the left, or add a new one.
          </div>
        )}
      </div>
    </div>
  );
}

function NoteDetail({
  note,
  projectId,
  onChange,
  onDelete,
}: {
  note: NoteRow;
  projectId: string;
  onChange: (id: string, patch: Partial<NoteRow>) => void;
  onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(note);

  useEffect(() => {
    latestRef.current = note;
  }, [note]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function scheduleSave() {
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const n = latestRef.current;
      updateStoryBibleEntry(note.id, projectId, {
        title: n.title,
        body: n.body || null,
        type: n.type,
      }).finally(() => setStatus("saved"));
    }, SAVE_DELAY_MS);
  }

  function setTitle(value: string) {
    onChange(note.id, { title: value });
    scheduleSave();
  }

  function setBody(value: string) {
    onChange(note.id, { body: value });
    scheduleSave();
  }

  function setType(value: StoryBibleEntryTypeValue) {
    onChange(note.id, { type: value });
    scheduleSave();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <input
          value={note.title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Note title"
          className="min-w-0 flex-1 bg-transparent font-display text-2xl font-semibold outline-none placeholder:text-muted-foreground"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {status === "saving" ? "Saving…" : "Saved"}
        </span>
        <button
          type="button"
          onClick={() => onDelete(note.id)}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Category</Label>
          <select
            value={note.type}
            onChange={(e) => setType(e.target.value as StoryBibleEntryTypeValue)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {(Object.keys(TYPE_LABEL) as StoryBibleEntryTypeValue[]).map((t) => (
              <option key={t} value={t}>
                {TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label>Details</Label>
          <Textarea
            rows={10}
            value={note.body ?? ""}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write it all out here."
          />
        </div>
      </div>
    </div>
  );
}
