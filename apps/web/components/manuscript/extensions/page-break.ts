// A manual, writer-inserted page break -- distinct from the automatic
// chapter/scene breaks the export pipeline already generates on its own
// (see tiptap-to-xhtml.ts / print-html.ts / build-epub.ts). This is for a
// writer who wants to force a break at a specific spot mid-scene (a
// Vellum-parity feature request, 2026-09-06).
//
// Modeled as an atomic block node -- one indivisible unit, the same shape
// Tiptap's own built-in HorizontalRule uses -- rather than a mark or
// inline node, since a page break is a structural, block-level event with
// no text content of its own, not part of any paragraph's inline flow.
//
// Export handling lives in packages/formatting-engine/tiptap-to-xhtml.ts's
// renderBlock() "pageBreak" case: it renders this node as an empty marker
// div that print-html.ts and build-epub.ts each turn into a real forced
// page break via CSS (break-after / page-break-after) in their own
// stylesheets -- this file only needs to know about the editor.

import { Node, mergeAttributes } from "@tiptap/core";

export interface PageBreakOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageBreak: {
      /** Insert a manual page break at the current selection. */
      setPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create<PageBreakOptions>({
  name: "pageBreak",

  addOptions() {
    return { HTMLAttributes: {} };
  },

  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "page-break",
        class: "manuscript-page-break",
      }),
    ];
  },

  addCommands() {
    return {
      setPageBreak:
        () =>
        ({ commands }) => {
          return commands.insertContent({ type: this.name });
        },
    };
  },
});

export default PageBreak;
