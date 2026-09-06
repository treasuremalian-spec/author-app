// An inline manuscript image -- the last of the originally-deferred
// Vellum-parity features (mirrored margins/paragraph indent/line spacing/
// drop caps/chapter-starts-on-right, manual page breaks, ornamental scene
// breaks, and text-message blocks all shipped first; images needed real
// storage/upload infrastructure the others didn't, see the upload flow in
// Toolbar.tsx and the "manuscript-images" Storage bucket in
// supabase/migrations/). Vellum-parity feature request, 2026-09-06.
//
// One node with a "displayMode" attribute rather than three separate node
// types -- "header" (a modest, centered image, styled to sit under a
// chapter title), "spread" (a full dedicated page in print/EPUB), or
// "caption" (an inline photo with an optional caption, the default) --
// since a writer changing their mind about how an already-placed image
// should read is just an attribute change, not a delete-and-reinsert.
//
// Atomic (holds no editable text content of its own -- an image plus a
// short caption STRING attribute, not nested rich content) and rendered
// via a React NodeView (see ./manuscript-image-view.tsx) rather than plain
// renderHTML, since -- unlike every other custom node in this folder --
// this one needs interactive in-editor controls (the mode switcher, the
// caption field) rather than just a static display.
//
// Export handling lives in packages/formatting-engine/tiptap-to-xhtml.ts's
// "manuscriptImage" case: it renders a <figure> whose <img src> comes from
// a RenderContext.resolveImage callback each export pipeline supplies --
// this file only needs to know about the editor.

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ManuscriptImageView } from "./manuscript-image-view";

export type ManuscriptImageDisplayMode = "header" | "spread" | "caption";

export interface ManuscriptImageAttrs {
  src: string;
  alt?: string;
  displayMode?: ManuscriptImageDisplayMode;
  caption?: string;
}

export interface ManuscriptImageOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    manuscriptImage: {
      /** Insert an already-uploaded image at the current selection. */
      insertManuscriptImage: (attrs: ManuscriptImageAttrs) => ReturnType;
    };
  }
}

export const ManuscriptImage = Node.create<ManuscriptImageOptions>({
  name: "manuscriptImage",

  addOptions() {
    return { HTMLAttributes: {} };
  },

  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: "" },
      displayMode: {
        default: "caption",
        parseHTML: (element) => element.getAttribute("data-display-mode") || "caption",
        renderHTML: (attrs) => ({ "data-display-mode": attrs.displayMode }),
      },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") || "",
        renderHTML: (attrs) => (attrs.caption ? { "data-caption": attrs.caption } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="manuscript-image"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "manuscript-image",
        class: "manuscript-image-node",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ManuscriptImageView);
  },

  addCommands() {
    return {
      insertManuscriptImage:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name, attrs });
        },
    };
  },
});

export default ManuscriptImage;
