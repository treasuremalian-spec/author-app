"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Maximize2, Minimize2 } from "lucide-react";

import { PageBreak } from "./extensions/page-break";

import { countWords, EMPTY_DOC } from "@/lib/wordcount";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "./Toolbar";

const AUTOSAVE_DELAY_MS = 1500;
const RETRY_DELAY_MS = 4000;

interface SceneEditorProps {
  sceneId: string;
  projectId: string;
  title: string;
  initialContent: unknown;
  onWordCountChange: (sceneId: string, wordCount: number) => void;
  onContentChange: (sceneId: string, content: unknown) => void;
}

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
}: SceneEditorProps) {
  const router = useRouter();
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saved");
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always mirrors the newest edited content that hasn't been confirmed saved
  // yet. Read by the flush-on-unmount cleanup and the beforeunload guard, so
  // a scene switch or a closed tab can never silently drop the last edit.
  const pendingContentRef = useRef<unknown>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Underline,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Placeholder.configure({ placeholder: "Start writing..." }),
        PageBreak,
      ],
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

  if (!editor) return null;

  return (
    <div className={cn("flex h-full flex-col bg-muted/30", focusMode && "fixed inset-0 z-40 bg-muted/50")}>
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <p className="truncate font-display text-base font-semibold">{title}</p>
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

      <EditorToolbar editor={editor} />

      <div className="flex-1 overflow-y-auto px-6 py-10 sm:px-10">
        <div className="mx-auto max-w-2xl rounded-2xl border border-border bg-card px-8 py-10 shadow-sm sm:px-14 sm:py-14">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
