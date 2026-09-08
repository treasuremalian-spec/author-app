"use client";

// The interactive editor-side view for a "manuscriptImage" node (see
// ./manuscript-image.ts) -- the image itself, plus, only while the node is
// selected, a small floating control bar to switch its display mode
// (header/spread/caption), and (for header/caption images only -- a spread
// always fills the whole page, so alignment/sizing don't apply to it, see
// the render note in tiptap-to-xhtml.ts) its horizontal alignment and a
// size preset. In caption mode there's also a caption text field.
// Everything here is purely an editing affordance; none of it is what
// export sees (that's tiptap-to-xhtml.ts's "manuscriptImage" case).

import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { Rows, GalleryVertical, BookOpen, Newspaper, Trash2, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ManuscriptImageAlign, ManuscriptImageDisplayMode } from "./manuscript-image";
import { MANUSCRIPT_IMAGE_WIDTH_PRESETS } from "./manuscript-image";

const MODE_OPTIONS: { mode: ManuscriptImageDisplayMode; label: string; icon: typeof Rows }[] = [
  { mode: "header", label: "Header", icon: Rows },
  { mode: "spread", label: "Full-page spread", icon: GalleryVertical },
  // "Double-page spread" (2026-09-08): one photo split across two facing
  // print pages -- print-PDF-only (see the long comment in
  // manuscript-image.ts), so this shows in the editor and preview as a
  // single full image, same as "spread", the way it also renders in EPUB.
  { mode: "spread-double", label: "Double-page spread", icon: BookOpen },
  { mode: "caption", label: "Photo + caption", icon: Newspaper },
];

const ALIGN_OPTIONS: { align: ManuscriptImageAlign; label: string; icon: typeof AlignLeft }[] = [
  { align: "left", label: "Align left", icon: AlignLeft },
  { align: "center", label: "Align center", icon: AlignCenter },
  { align: "right", label: "Align right", icon: AlignRight },
];

export function ManuscriptImageView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const displayMode: ManuscriptImageDisplayMode =
    node.attrs.displayMode === "header" || node.attrs.displayMode === "spread" || node.attrs.displayMode === "spread-double"
      ? node.attrs.displayMode
      : "caption";
  const caption: string = typeof node.attrs.caption === "string" ? node.attrs.caption : "";
  const align: ManuscriptImageAlign =
    node.attrs.align === "left" || node.attrs.align === "right" ? node.attrs.align : "center";
  const widthPercent: number | null = typeof node.attrs.widthPercent === "number" ? node.attrs.widthPercent : null;
  // A "spread-double" image fills two whole pages by definition, exactly
  // like "spread" fills one -- alignment/sizing don't apply to either.
  const showSizingControls = displayMode !== "spread" && displayMode !== "spread-double";

  return (
    <NodeViewWrapper
      className={cn(
        "manuscript-image-node",
        `manuscript-image-node--${displayMode}`,
        `manuscript-image-node--align-${align}`,
        selected && "manuscript-image-node--selected"
      )}
    >
      <div className="relative" style={showSizingControls && widthPercent ? { width: `${widthPercent}%`, marginLeft: align === "right" ? "auto" : undefined, marginRight: align === "left" ? "auto" : undefined, marginInline: align === "center" ? "auto" : undefined } : undefined}>
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

            {showSizingControls && (
              <>
                <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                {ALIGN_OPTIONS.map(({ align: a, label, icon: Icon }) => (
                  <button
                    key={a}
                    type="button"
                    title={label}
                    aria-label={label}
                    onClick={() => updateAttributes({ align: a })}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                      align === a &&
                        "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                    )}
                  >
                    <Icon className="size-3.5" />
                  </button>
                ))}
                <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
                <select
                  aria-label="Image size"
                  value={widthPercent ?? ""}
                  onChange={(e) => updateAttributes({ widthPercent: e.target.value ? Number(e.target.value) : null })}
                  className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
                >
                  {MANUSCRIPT_IMAGE_WIDTH_PRESETS.map((preset) => (
                    <option key={preset.label} value={preset.value ?? ""}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </>
            )}

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
