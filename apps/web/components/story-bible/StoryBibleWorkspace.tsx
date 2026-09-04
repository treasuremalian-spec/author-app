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
      <div className="flex items-center gap-1 border-b border-border bg-card px-4 py-2">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              tab === id
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {count > 0 && <span className="text-xs text-muted-foreground">{count}</span>}
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
