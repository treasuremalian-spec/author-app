"use client";

import { useRef, useState } from "react";
import { History, RotateCcw } from "lucide-react";

import {
  listSceneVersions,
  restoreSceneVersion,
  updateSceneMeta,
} from "@/lib/actions/manuscript";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABEL,
  type SceneData,
  type SceneStatusValue,
} from "@/lib/manuscript-tree";

const NOTES_SAVE_DELAY_MS = 1200;

interface SceneInspectorProps {
  sceneId: string;
  projectId: string;
  scene: SceneData;
  characters: { id: string; name: string }[];
  onMetaChange: (sceneId: string, patch: Partial<SceneData>) => void;
  onRestored: (sceneId: string, content: unknown, wordCount: number) => void;
}

interface VersionRow {
  id: string;
  wordCount: number;
  createdAt: string | Date;
}

function timeAgo(date: string | Date) {
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export function SceneInspector({
  sceneId,
  projectId,
  scene,
  characters,
  onMetaChange,
  onRestored,
}: SceneInspectorProps) {
  const [notes, setNotes] = useState(scene.notes ?? "");
  const [targetWordCount, setTargetWordCount] = useState(scene.targetWordCount?.toString() ?? "");
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleStatusChange(status: SceneStatusValue) {
    onMetaChange(sceneId, { status });
    updateSceneMeta(sceneId, projectId, { status });
  }

  function handlePovChange(povCharacterId: string) {
    const value = povCharacterId || null;
    onMetaChange(sceneId, { povCharacterId: value });
    updateSceneMeta(sceneId, projectId, { povCharacterId: value });
  }

  function handleTargetBlur() {
    const value = targetWordCount.trim() ? parseInt(targetWordCount, 10) : null;
    onMetaChange(sceneId, { targetWordCount: value });
    updateSceneMeta(sceneId, projectId, { targetWordCount: value });
  }

  function handleNotesChange(value: string) {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      onMetaChange(sceneId, { notes: value });
      updateSceneMeta(sceneId, projectId, { notes: value || null });
    }, NOTES_SAVE_DELAY_MS);
  }

  async function loadVersions() {
    setLoadingVersions(true);
    const rows = await listSceneVersions(sceneId, projectId);
    setVersions(rows);
    setLoadingVersions(false);
  }

  async function handleRestore(versionId: string) {
    const result = await restoreSceneVersion(sceneId, versionId, projectId);
    onRestored(sceneId, result.content, result.wordCount);
    loadVersions();
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Scene details
      </p>

      <div className="space-y-5">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <div className="flex flex-wrap gap-1.5">
            {(Object.keys(STATUS_LABEL) as SceneStatusValue[]).map((s) => {
              const isActive = scene.status === s;
              return (
                <button key={s} type="button" onClick={() => handleStatusChange(s)}>
                  <Badge variant={isActive ? STATUS_BADGE_VARIANT[s] : "outline"}>
                    {STATUS_LABEL[s]}
                  </Badge>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pov">POV character</Label>
          <select
            id="pov"
            value={scene.povCharacterId ?? ""}
            onChange={(e) => handlePovChange(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Not set</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="targetWordCount">Target word count</Label>
          <Input
            id="targetWordCount"
            type="number"
            min={0}
            value={targetWordCount}
            onChange={(e) => setTargetWordCount(e.target.value)}
            onBlur={handleTargetBlur}
            placeholder="e.g. 2000"
          />
          <p className="text-xs text-muted-foreground">
            {scene.wordCount.toLocaleString()} words so far
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Scene notes</Label>
          <Textarea
            id="notes"
            rows={5}
            value={notes}
            onChange={(e) => handleNotesChange(e.target.value)}
            placeholder="What needs to happen in this scene? Reminders to yourself, plot beats, anything."
          />
        </div>

        <div className="border-t border-border pt-4">
          <button
            type="button"
            onClick={loadVersions}
            className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-primary">
              <History className="size-3.5" />
            </span>
            Version history
          </button>

          {loadingVersions && <p className="mt-2 text-xs text-muted-foreground">Loading…</p>}

          {versions && versions.length === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              No saved snapshots yet -- these build up automatically as you write.
            </p>
          )}

          {versions && versions.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex items-center justify-between rounded-md border border-border bg-card px-2.5 py-1.5 text-xs"
                >
                  <span className="text-muted-foreground">
                    {timeAgo(v.createdAt)} · {v.wordCount.toLocaleString()} words
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRestore(v.id)}
                    className="flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    <RotateCcw className="size-3" />
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
