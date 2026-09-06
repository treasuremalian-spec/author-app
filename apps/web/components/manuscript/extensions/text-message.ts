// A "text conversation" content block -- a writer toggles a paragraph
// into this style to set off a texting/DM scene visually, the way Vellum's
// own built-in "Text Conversation" paragraph style does (seen in one of
// Tasia's reference screenshots). Vellum-parity feature request,
// 2026-09-06, alongside the page-break and scene-break nodes it sits next
// to in the toolbar.
//
// Modeled directly on Tiptap's own Heading node -- NOT atomic, holds
// normal inline text content ("inline*"), and toggles back and forth with
// a plain paragraph via toggleNode(), exactly like toggleHeading() does.
// A message is written and edited exactly like a normal line of text; the
// only difference is which side of the page/screen it renders on, which
// reuses the EDITOR'S EXISTING alignment buttons rather than adding new
// UI: SceneEditor.tsx's TextAlign extension is configured for this node
// type too, so the writer sets the "sender" side with the same
// align-left/align-center/align-right buttons already in the toolbar.
//
// Rendered as a content-width "bubble" (background, rounded corners, a
// sans-serif face distinct from body prose) positioned left/right/center
// via `display: table` + margin -- NOT `display: inline-block`, whose own
// box can't be positioned by its own text-align (only margin can move an
// inline-block's box; text-align only aligns content INSIDE a box). See
// globals.css (editor view) and tiptap-to-xhtml.ts's "textMessage" case
// plus print-html.ts / build-epub.ts (export) for the two places this
// same positioning trick is applied.

import { Node, mergeAttributes } from "@tiptap/core";

export interface TextMessageOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textMessage: {
      /** Toggle the current paragraph between a normal paragraph and a text-message bubble. */
      toggleTextMessage: () => ReturnType;
    };
  }
}

export const TextMessage = Node.create<TextMessageOptions>({
  name: "textMessage",

  addOptions() {
    return { HTMLAttributes: {} };
  },

  group: "block",
  content: "inline*",
  defining: true,

  parseHTML() {
    return [{ tag: 'p[data-type="text-message"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "p",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "text-message",
        class: "manuscript-text-message",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleTextMessage:
        () =>
        ({ commands }) => {
          return commands.toggleNode(this.name, "paragraph");
        },
    };
  },
});

export default TextMessage;
