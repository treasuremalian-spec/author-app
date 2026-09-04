"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Plus, Trash2 } from "lucide-react";

import {
  createLocation,
  deleteLocation,
  updateLocation,
  type LocationUpdateData,
} from "@/lib/actions/story-bible";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface LocationRow extends LocationUpdateData {
  id: string;
  name: string;
}

const SAVE_DELAY_MS = 900;

export function LocationsPanel({
  projectId,
  initialLocations,
}: {
  projectId: string;
  initialLocations: LocationRow[];
}) {
  const [locations, setLocations] = useState<LocationRow[]>(initialLocations);
  const [selectedId, setSelectedId] = useState<string | null>(initialLocations[0]?.id ?? null);

  const selected = locations.find((l) => l.id === selectedId) ?? null;

  async function handleCreate() {
    const created = await createLocation(projectId, "New Location");
    setLocations((prev) => [...prev, created as LocationRow]);
    setSelectedId(created.id);
  }

  function handleChange(id: string, patch: Partial<LocationRow>) {
    setLocations((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function handleDelete(id: string) {
    setLocations((prev) => prev.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
    deleteLocation(id, projectId).catch(() => {});
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[260px_1fr]">
      <aside className="min-h-0 overflow-y-auto border-r border-border bg-secondary/25 p-3">
        <button
          type="button"
          onClick={handleCreate}
          className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-primary/40 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/5"
        >
          <Plus className="size-3.5" /> New location
        </button>

        {locations.length === 0 ? (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No locations yet -- add your first one above.
          </p>
        ) : (
          <ul className="space-y-1">
            {locations.map((l) => (
              <li key={l.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(l.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border-l-2 px-2 py-2 text-left text-sm transition-colors",
                    l.id === selectedId
                      ? "border-primary bg-primary/15 font-medium text-primary"
                      : "border-transparent hover:bg-background/80"
                  )}
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
                    <MapPin className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{l.name || "Unnamed"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <div className="min-h-0 overflow-y-auto bg-muted/20">
        {selected ? (
          <LocationDetail
            key={selected.id}
            location={selected}
            projectId={projectId}
            onChange={handleChange}
            onDelete={handleDelete}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-muted-foreground">
            Select a location from the left, or add a new one.
          </div>
        )}
      </div>
    </div>
  );
}

function LocationDetail({
  location,
  projectId,
  onChange,
  onDelete,
}: {
  location: LocationRow;
  projectId: string;
  onChange: (id: string, patch: Partial<LocationRow>) => void;
  onDelete: (id: string) => void;
}) {
  const [status, setStatus] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(location);

  useEffect(() => {
    latestRef.current = location;
  }, [location]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function set(field: keyof LocationUpdateData, value: string) {
    onChange(location.id, { [field]: value } as Partial<LocationRow>);
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const l = latestRef.current;
      updateLocation(location.id, projectId, {
        name: l.name,
        description: l.description || null,
        notes: l.notes || null,
      }).finally(() => setStatus("saved"));
    }, SAVE_DELAY_MS);
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <input
          value={location.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="Location name"
          className="min-w-0 flex-1 bg-transparent font-display text-2xl font-semibold outline-none placeholder:text-muted-foreground"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {status === "saving" ? "Saving…" : "Saved"}
        </span>
        <button
          type="button"
          onClick={() => onDelete(location.id)}
          className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            rows={5}
            value={location.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            placeholder="What does this place look, sound, and feel like?"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea
            rows={4}
            value={location.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="Anything else worth remembering -- who lives here, what happens here, continuity notes."
          />
        </div>
      </div>
    </div>
  );
}
