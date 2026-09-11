"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import { Maximize2, Minimize2 } from "lucide-react";

import { EDITOR_EXTENSIONS } from "./extensions/editor-extensions";

import { countWords, EMPTY_DOC } from "@/lib/wordcount";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "./Toolbar";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";
import { SprintPanel } from "@/components/sprints/SprintPanel";

const AUTOSAVE_DELAY_MS = 1500;
const RETRY_DELAY_MS = 4000;

interface SceneEditorProps {
  sceneId: string;
  projectId: string;
  title: string;
  initialContent: unknown;
  onWordCountChange: (sceneId: string, wordCount: number) => void;
  onContentChange: (sceneId: string, content: unknown) => void;
  // Book-wide search (2026-09-11) -- a jump/replace queued by
  // ProjectWorkspace for the chapter THIS editor instance is for, applied
  // once (see the effect below), then cleared via onPendingActionHandled.
  // Null/undefined on every other render -- no search interaction pending.
  pendingAction?: PendingEditorAction | null;
  onPendingActionHandled?: () => void;
}

// {from, to} are real ProseMirror document positions, computed by
// manuscript-search.ts against this exact scene's content -- see that
// module's comment for why those positions are trustworthy without this
// editor needing to have been mounted at search time.
export type PendingEditorAction =
  | { type: "select"; nodeId: string; from: number; to: number; nonce: number }
  | { type: "replace"; nodeId: string; from: number; to: number; replacement: string; nonce: number };

type SaveResult =
  | { ok: true; wordCount: number }
  | { ok: false; error: string; unauthorized?: boolean };

// Plain fetch() to a Route Handler, not a Server Action -- see
// lib/scene-save.ts for why (Server Actions here hit two real, obscure
// framework bugs in a row: production error redaction, then a "temporary
// client reference" crash). A plain HTTP request/response sidesteps both.
async function saveScene(sceneId: string, projectId: string, content: unknown): Promise<SaveResult> {
  try {
    const res = await fetch(`/api/scenes/${sceneId}/save`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, content }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        error: (data && typeof data.error === "string" && data.error) || `Save failed (status ${res.status}).`,
        unauthorized: res.status === 401,
      };
    }
    return { ok: true, wordCount: data?.wordCount ?? countWords(content) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function SceneEditor({
  sceneId,
  projectId,
  title,
  initialContent,
  onWordCountChange,
  onContentChange,
  pendingAction,
  onPendingActionHandled,
}: SceneEditorProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saved");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [sprinting, setSprinting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always mirrors the newest edited content that hasn't been confirmed saved
  // yet. Read by the flush-on-unmount cleanup and the beforeunload guard, so
  // a scene switch or a closed tab can never silently drop the last edit.
  const pendingContentRef = useRef<unknown>(null);

  const editor = useEditor(
    {
      // Shared with manuscript-search.ts's headless schema (see
      // editor-extensions.ts) so a book-search match's position is always
      // computed against the exact same schema this live editor uses.
      extensions: EDITOR_EXTENSIONS,
      content: (initialContent as object) ?? EMPTY_DOC,
      immediatelyRender: false,
      editorProps: {
        attributes: {
          class:
            "prose prose-neutral dark:prose-invert max-w-none focus:outline-none min-h-[60vh] font-serif text-[17px] leading-[1.75]",
        },
      },
      onUpdate: ({ editor }) => {
        const json = editor.getJSON();
        const words = countWords(json);
        onWordCountChange(sceneId, words);
        // Keep the parent's in-memory copy current immediately (not
        // debounced) so re-selecting this scene later in the same session
        // never falls back to the stale, pre-edit content that was loaded
        // when the page first opened.
        onContentChange(sceneId, json);
        pendingContentRef.current = json;
        setStatus("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = scheduleSave(json);
      },
    },
    [sceneId]
  );

  function scheduleSave(json: unknown, delay = AUTOSAVE_DELAY_MS) {
    return setTimeout(async () => {
      const result = await saveScene(sceneId, projectId, json);
      if (!result.ok) {
        console.error("Autosave failed for scene", sceneId, result.error);
        if (result.unauthorized) {
          // The session's gone -- retrying forever would just spin. Send
          // them to log back in; their unsaved edit still gets flushed on
          // the way out via the unmount cleanup below.
          router.push("/login");
          return;
        }
        setStatus("error");
        setErrorDetail(result.error);
        // Keep retrying in the background -- pendingContentRef stays set,
        // so a scene switch or tab close in the meantime still flushes it.
        saveTimer.current = scheduleSave(json, RETRY_DELAY_MS);
        return;
      }
      // Only clear the pending marker if nothing newer has been typed
      // while this save was in flight.
      if (pendingContentRef.current === json) {
        pendingContentRef.current = null;
        setStatus("saved");
        setErrorDetail(null);
      }
    }, delay);
  }

  useEffect(() => {
    // Warn before an actual tab close / refresh if there's an edit that
    // hasn't been confirmed saved yet.
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (pendingContentRef.current !== null) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Flush rather than discard: switching to another scene (or leaving
      // the page) unmounts this component, and previously that just
      // cancelled the pending debounce -- silently losing whatever was
      // typed in the last second and a half.
      if (pendingContentRef.current !== null) {
        saveScene(sceneId, projectId, pendingContentRef.current).then((result) => {
          if (!result.ok) {
            console.error("Flush-on-exit save failed for scene", sceneId, result.error);
          }
        });
      }
    };
  }, [sceneId, projectId]);

  useEffect(() => {
    // Applies a jump-to-match or single replace once BOTH the target
    // scene's editor is mounted (pendingAction.nodeId === this sceneId,
    // enforced by the parent) and `editor` itself is ready -- mirrors the
    // pre-existing refreshToken-remount trick used for version-restore:
    // useEditor's returned `editor` naturally transitions null -> ready,
    // re-triggering this effect, so it works correctly even when clicking
    // a search result switches which chapter is open (a fresh mount).
    if (!editor || !pendingAction) return;
    if (pendingAction.type === "select") {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: pendingAction.from, to: pendingAction.to })
        .scrollIntoView()
        .run();
    } else if (pendingAction.type === "replace") {
      editor
        .chain()
        .focus()
        .setTextSelection({ from: pendingAction.from, to: pendingAction.to })
        .deleteSelection()
        .insertContent(pendingAction.replacement)
        .scrollIntoView()
        .run();
    }
    onPendingActionHandled?.();
  }, [pendingAction, editor]);

  if (!editor) return null;

  return (
    <div className={cn("flex h-full flex-col bg-muted/30", focusMode && "fixed inset-0 z-40 bg-muted/50")}>
      <PresenceHeartbeat status={sprinting ? "SPRINTING" : "WRITING"} />
      <SprintPanel onActiveChange={setSprinting} />
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <p className="truncate font-display text-base italic">{title}</p>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <div className="flex flex-col items-end">
            <span
              className={cn(
                "flex w-24 items-center justify-end gap-1 text-right",
                status === "saved" && "text-success",
                status === "saving" && "text-muted-foreground",
                status === "error" && "text-destructive"
              )}
              title={errorDetail ?? undefined}
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  status === "saved" && "bg-success",
                  status === "saving" && "animate-pulse bg-muted-foreground",
                  status === "error" && "bg-destructive"
                )}
              />
              {status === "saving" && "Saving…"}
              {status === "saved" && "Saved"}
              {status === "error" && "Couldn't save — retrying"}
            </span>
            {status === "error" && errorDetail && (
              <span className="max-w-[220px] truncate text-[10px] text-destructive/80" title={errorDetail}>
                {errorDetail}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFocusMode((f) => !f)}
            className="flex items-center gap-1 text-muted-foreground hover:text-primary"
          >
            {focusMode ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
            {focusMode ? "Exit focus" : "Focus mode"}
          </button>
        </div>
      </div>

      <EditorToolbar editor={editor} projectId={projectId} sceneId={sceneId} />

      <div className="flex-1 overflow-y-auto px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-2xl border border-border bg-card px-8 py-10 shadow-none sm:px-14 sm:py-14">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
