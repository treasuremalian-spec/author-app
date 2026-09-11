"use client";

import { useState } from "react";
import { BookMarked, MapPin, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { CharactersPanel, type CharacterRow } from "./CharactersPanel";
import { LocationsPanel, type LocationRow } from "./LocationsPanel";
import { NotesPanel, type NoteRow } from "./NotesPanel";

type Tab = "characters" | "locations" | "notes";

export function StoryBibleWorkspace({
  projectId,
  initialCharacters,
  initialLocations,
  initialNotes,
}: {
  projectId: string;
  initialCharacters: CharacterRow[];
  initialLocations: LocationRow[];
  initialNotes: NoteRow[];
}) {
  const [tab, setTab] = useState<Tab>("characters");

  const tabs: { id: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { id: "characters", label: "Characters", icon: Users, count: initialCharacters.length },
    { id: "locations", label: "Locations", icon: MapPin, count: initialLocations.length },
    { id: "notes", label: "Story notes", icon: BookMarked, count: initialNotes.length },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 items-center gap-6 border-b border-border bg-card px-4">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex h-full items-center gap-1.5 border-b-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors",
              tab === id
                ? "border-accent text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {count > 0 && <span className="font-mono text-muted-foreground">{count}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1">
        {tab === "characters" && (
          <CharactersPanel projectId={projectId} initialCharacters={initialCharacters} />
        )}
        {tab === "locations" && (
          <LocationsPanel projectId={projectId} initialLocations={initialLocations} />
        )}
        {tab === "notes" && <NotesPanel projectId={projectId} initialNotes={initialNotes} />}
      </div>
    </div>
  );
}
