"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, User } from "lucide-react";

import {
  createCharacter,
  deleteCharacter,
  updateCharacter,
  type CharacterUpdateData,
} from "@/lib/actions/story-bible";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface CharacterRow extends CharacterUpdateData {
  id: string;
  name: string;
}

const SAVE_DELAY_MS = 900;

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {multiline ? (
        <Textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      )}
    </div>
  );
}

export function CharactersPanel({
  projectId,
  initialCharacters,
}: {
  projectId: string;
  initialCharacters: CharacterRow[];
}) {
  const [characters, setCharacters] = useState<CharacterRow[]>(initialCharacters);
  const [selectedId, setSelectedId] = useState<string | null>(initialCharacters[0]?.id ?? null);

  const selected = characters.find((c) => c.id === selectedId) ?? null;

  async function handleCreate() {
    const created = await createCharacter(projectId, "New Character");
    setCharacters((prev) => [...prev, created as CharacterRow]);
    setSelectedId(created.id);
  }

  function handleChange(id: string, patch: Partial<CharacterRow>) {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function handleDelete(id: string) {
    setCharacters((prev) => prev.filter((c) => c.id !== id));
    if (selectedId === id) setSelectedId(null);
    deleteCharacter(id, projectId).catch(() => {});
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_1fr]">
      <aside className="min-h-0 overflow-y-auto border-r border-border bg-secondary/25 p-3">
        <button
          type="button"
          onClick={handleCreate}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
        >
          <Plus className="size-3.5" /> New character
        </button>

        {characters.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No characters yet -- add your first one above.
          </p>
        ) : (
          <ul className="space-y-1">
            {characters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border-l-2 px-2 py-2 text-left text-sm transition-colors",
                    c.id === selectedId
                      ? "border-primary bg-primary/15 font-medium text-primary"
                      : "border-transparent hover:bg-background/80"
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{c.name || "Unnamed"}</span>
                    {(c.occupation || c.age) && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.occupation, c.age].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="min-h-0 overflow-y-auto bg-muted/20">
        {selected ? (
          <CharacterDetail
            key={selected.id}
            character={selected}
            projectId={projectId}
            onChange={handleChange}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Select a character from the left, or add a new one.
          </div>
        )}
      </div>
    </div>
  );
}

function CharacterDetail({
  character,
  projectId,
  onChange,
  onDelete,
}: {
  character: CharacterRow;
  projectId: string;
  onChange: (id: string, patch: Partial<CharacterRow>) => void;
  onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(character);

  useEffect(() => {
    latestRef.current = character;
  }, [character]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function set(field: keyof CharacterUpdateData, value: string) {
    onChange(character.id, { [field]: value } as Partial<CharacterRow>);
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const c = latestRef.current;
      updateCharacter(character.id, projectId, {
        name: c.name,
        nickname: c.nickname || null,
        photoUrl: c.photoUrl || null,
        age: c.age || null,
        birthday: c.birthday || null,
        appearance: c.appearance || null,
        personality: c.personality || null,
        occupation: c.occupation || null,
        family: c.family || null,
        backstory: c.backstory || null,
        goals: c.goals || null,
        motivation: c.motivation || null,
        fears: c.fears || null,
        secrets: c.secrets || null,
        likesDislikes: c.likesDislikes || null,
        arc: c.arc || null,
        dialogueStyle: c.dialogueStyle || null,
        notes: c.notes || null,
      }).finally(() => setStatus("saved"));
    }, SAVE_DELAY_MS);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <input
          value={character.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Character name"
          className="min-w-0 flex-1 bg-transparent font-display text-2xl font-semibold outline-none placeholder:text-muted-foreground"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {status === "saving" ? "Saving…" : "Saved"}
        </span>
        <button
          type="button"
          onClick={() => onDelete(character.id)}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="space-y-6">
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Basics</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nickname" value={character.nickname ?? ""} onChange={(v) => set("nickname", v)} />
            <Field label="Occupation" value={character.occupation ?? ""} onChange={(v) => set("occupation", v)} />
            <Field label="Age" value={character.age ?? ""} onChange={(v) => set("age", v)} />
            <Field label="Birthday" value={character.birthday ?? ""} onChange={(v) => set("birthday", v)} />
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Appearance &amp; personality
          </p>
          <Field label="Appearance" value={character.appearance ?? ""} onChange={(v) => set("appearance", v)} multiline />
          <Field label="Personality" value={character.personality ?? ""} onChange={(v) => set("personality", v)} multiline />
          <Field label="Likes &amp; dislikes" value={character.likesDislikes ?? ""} onChange={(v) => set("likesDislikes", v)} multiline />
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Story role</p>
          <Field label="Goals" value={character.goals ?? ""} onChange={(v) => set("goals", v)} multiline />
          <Field label="Motivation" value={character.motivation ?? ""} onChange={(v) => set("motivation", v)} multiline />
          <Field label="Fears" value={character.fears ?? ""} onChange={(v) => set("fears", v)} multiline />
          <Field label="Secrets" value={character.secrets ?? ""} onChange={(v) => set("secrets", v)} multiline />
          <Field label="Arc" value={character.arc ?? ""} onChange={(v) => set("arc", v)} multiline />
          <Field label="Dialogue style" value={character.dialogueStyle ?? ""} onChange={(v) => set("dialogueStyle", v)} multiline />
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Family &amp; backstory
          </p>
          <Field label="Family" value={character.family ?? ""} onChange={(v) => set("family", v)} multiline />
          <Field label="Backstory" value={character.backstory ?? ""} onChange={(v) => set("backstory", v)} multiline />
        </section>

        <section className="space-y-3 border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</p>
          <Field label="Notes" value={character.notes ?? ""} onChange={(v) => set("notes", v)} multiline />
        </section>
      </div>
    </div>
  );
}
