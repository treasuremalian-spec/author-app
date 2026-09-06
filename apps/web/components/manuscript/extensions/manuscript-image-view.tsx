"use client";

// The interactive editor-side view for a "manuscriptImage" node (see
// ./manuscript-image.ts) -- the image itself, plus, only while the node is
// selected, a small floating control bar to switch its display mode
// (header/spread/caption) and, in caption mode, edit the caption text.
// Everything here is purely an editing affordance; none of it is what
// export sees (that's tiptap-to-xhtml.ts's "manuscriptImage" case).

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { Rows, GalleryVertical, Newspaper, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ManuscriptImageDisplayMode } from "./manuscript-image";

const MODE_OPTIONS: { mode: ManuscriptImageDisplayMode; label: string; icon: typeof Rows }[] = [
  { mode: "header", label: "Header", icon: Rows },
  { mode: "spread", label: "Full-page spread", icon: GalleryVertical },
  { mode: "caption", label: "Photo + caption", icon: Newspaper },
];

export function ManuscriptImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const displayMode: ManuscriptImageDisplayMode =
    node.attrs.displayMode === "header" || node.attrs.displayMode === "spread" ? node.attrs.displayMode : "caption";
  const caption: string = typeof node.attrs.caption === "string" ? node.attrs.caption : "";

  return (
    <NodeViewWrapper
      className={cn(
        "manuscript-image-node",
        `manuscript-image-node--${displayMode}`,
        selected && "manuscript-image-node--selected"
      )}
    >
      <div className="relative">
        {/* eslint-disable-next-line @next/next/no-img-element -- a Supabase Storage URL, not a local/optimizable asset */}
        <img src={node.attrs.src} alt={node.attrs.alt || ""} className="manuscript-image-node__img" />

        {selected && (
          <div className="manuscript-image-node__controls" contentEditable={false}>
            {MODE_OPTIONS.map(({ mode, label, icon: Icon }) => (
              <button
                key={mode}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => updateAttributes({ displayMode: mode })}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                  displayMode === mode &&
                    "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                )}
              >
                <Icon className="size-3.5" />
              </button>
            ))}
            <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              title="Remove image"
              aria-label="Remove image"
              onClick={() => deleteNode()}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {displayMode === "caption" && (selected || caption) && (
        <div contentEditable={false}>
          <input
            type="text"
            value={caption}
            placeholder="Add a caption..."
            onChange={(e) => updateAttributes({ caption: e.target.value })}
            className="manuscript-image-node__caption-input"
          />
        </div>
      )}
    </NodeViewWrapper>
  );
}

export default ManuscriptImageView;
