"use client";

import { useEffect, useRef, useState } from "react";
import { Music } from "lucide-react";

import { updateProjectDetails, type ProjectDetails, type ProjectDetailsUpdate } from "@/lib/actions/overview";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

const SAVE_DELAY_MS = 900;

function toDateInputValue(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  return date.toISOString().slice(0, 10);
}

export function BookDetailsPanel({
  projectId,
  details,
  onChange,
}: {
  projectId: string;
  details: ProjectDetails;
  onChange: (patch: Partial<ProjectDetails>) => void;
}) {
  const [status, setStatus] = useState<"saved" | "saving">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef(details);
  const [tropesInput, setTropesInput] = useState(details.tropes.join(", "));

  useEffect(() => {
    latestRef.current = details;
  }, [details]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  function scheduleSave(patch: ProjectDetailsUpdate) {
    setStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      updateProjectDetails(projectId, patch).finally(() => setStatus("saved"));
    }, SAVE_DELAY_MS);
  }

  function setField<K extends keyof ProjectDetails>(field: K, value: ProjectDetails[K]) {
    onChange({ [field]: value } as Partial<ProjectDetails>);
    scheduleSave({ [field]: value } as ProjectDetailsUpdate);
  }

  function commitTropes() {
    const tropes = tropesInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    onChange({ tropes });
    scheduleSave({ tropes });
  }

  return (
    <Card className="space-y-5 p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Book details
        </p>
        <span className="text-xs text-muted-foreground">
          {status === "saving" ? "Saving…" : "Saved"}
        </span>
      </div>

      <div className="space-y-1.5">
        <Label>Synopsis</Label>
        <Textarea
          rows={4}
          value={details.synopsis ?? ""}
          onChange={(e) => setField("synopsis", e.target.value)}
          placeholder="What's this book about, in a few sentences?"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tropes</Label>
          <Input
            value={tropesInput}
            onChange={(e) => setTropesInput(e.target.value)}
            onBlur={commitTropes}
            placeholder="Enemies to lovers, Slow burn"
          />
        </div>
        <div className="space-y-1.5">
          <Label>POV &amp; tense</Label>
          <Input
            value={details.povAndTense ?? ""}
            onChange={(e) => setField("povAndTense", e.target.value)}
            placeholder="First person, past tense"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Writing deadline</Label>
          <Input
            type="date"
            value={toDateInputValue(details.deadline)}
            onChange={(e) => setField("deadline", e.target.value ? new Date(e.target.value) : null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Release date</Label>
          <Input
            type="date"
            value={toDateInputValue(details.releaseDate)}
            onChange={(e) => setField("releaseDate", e.target.value ? new Date(e.target.value) : null)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Music className="size-3.5" /> Playlist link
        </Label>
        <Input
          value={details.playlistUrl ?? ""}
          onChange={(e) => setField("playlistUrl", e.target.value)}
          placeholder="Paste a Spotify/Apple Music playlist link"
        />
        {details.playlistUrl && (
          <a
            href={details.playlistUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs font-medium text-primary hover:underline"
          >
            Open playlist ↗
          </a>
        )}
      </div>
    </Card>
  );
}
