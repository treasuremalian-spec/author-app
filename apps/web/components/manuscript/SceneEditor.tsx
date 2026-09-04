"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import { Maximize2, Minimize2 } from "lucide-react";

import { saveSceneContent } from "@/lib/actions/manuscript";
import { countWords, EMPTY_DOC } from "@/lib/wordcount";
import { cn } from "@/lib/utils";
import { EditorToolbar } from "./Toolbar";

const AUTOSAVE_DELAY_MS = 1500;

interface SceneEditorProps {
  sceneId: string;
  projectId: string;
  title: string;
  initialContent: unknown;
  onWordCountChange: (sceneId: string, wordCount: number) => void;
}

export function SceneEditor({
  sceneId,
  projectId,
  title,
  initialContent,
  onWordCountChange,
}: SceneEditorProps) {
  const [status, setStatus] = useState<"saving" | "saved">("saved");
  const [focusMode, setFocusMode] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Underline,
        TextAlign.configure({ types: ["heading", "paragraph"] }),
        Placeholder.configure({ placeholder: "Start writing..." }),
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
        setStatus("saving");
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
          await saveSceneContent(sceneId, projectId, json);
          setStatus("saved");
        }, AUTOSAVE_DELAY_MS);
      },
    },
    [sceneId]
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  if (!editor) return null;

  return (
    <div className={cn("flex h-full flex-col bg-muted/30", focusMode && "fixed inset-0 z-40 bg-muted/50")}>
      <div className="flex items-center justify-between border-b border-border bg-card px-6 py-3">
        <p className="truncate font-display text-base font-semibold">{title}</p>
        <div className="flex shrink-0 items-center gap-3 text-xs">
          <span
            className={cn(
              "flex w-16 items-center justify-end gap-1 text-right",
              status === "saving" ? "text-muted-foreground" : "text-success"
            )}
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                status === "saving" ? "animate-pulse bg-muted-foreground" : "bg-success"
              )}
            />
            {status === "saving" ? "Saving…" : "Saved"}
          </span>
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
