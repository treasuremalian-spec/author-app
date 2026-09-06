// A manual, writer-inserted scene break -- an ornamental divider (like the
// "* * *" or "⁂" a writer drops between scenes) that can be placed anywhere
// mid-content and whose ornament style is a deliberate choice, not just
// whatever the export pipeline defaults to.
//
// Distinct from the export pipeline's EXISTING automatic scene divider
// (see print-html.ts's sceneHtml() / build-epub.ts's chapterPageHtml()),
// which always inserts a plain "⁂" between separate Scene records and
// isn't something a writer places by hand. This node is for a break a
// writer wants INSIDE a single scene's own text (or wants styled
// differently from the automatic default) -- a Vellum-parity feature
// request, 2026-09-06, alongside the page-break node it sits next to in
// the toolbar (see ./page-break.ts).
//
// Renders in export (tiptap-to-xhtml.ts's "sceneBreak" case) as
// `<p class="scene-break">{ornament}</p>` -- deliberately reusing the
// SAME ".scene-break" CSS class the automatic divider already uses in
// both print-html.ts and build-epub.ts, so a manual break looks visually
// identical in kind to an automatic one, just with a chosen glyph instead
// of the hardcoded "⁂".
//
// Ornament choices are deliberately limited to glyphs confirmed (via a
// real local render against the actual embedded Crimson Pro print font +
// the pinned @sparticuz/chromium engine, 2026-09-06) to display as real
// glyphs rather than a missing-glyph "tofu" box -- Crimson Pro's own
// embedded subset is Latin-only and doesn't contain any of these, but
// Chromium's own fallback stack renders all of them correctly, confirmed
// by real rendered-PDF inspection before this list was finalized.

import { Node, mergeAttributes } from "@tiptap/core";

export interface SceneBreakOption {
  id: string;
  label: string;
  ornament: string;
}

export const SCENE_BREAK_OPTIONS: SceneBreakOption[] = [
  { id: "asterism", label: "Asterism", ornament: "⁂" },
  { id: "dinkus", label: "Dinkus", ornament: "* * *" },
  { id: "dots", label: "Dots", ornament: "• • •" },
  { id: "diamond", label: "Diamond", ornament: "❖" },
  { id: "flourish", label: "Flourish", ornament: "❦" },
  { id: "flower", label: "Flower", ornament: "✿" },
];

export const DEFAULT_SCENE_BREAK_ORNAMENT = SCENE_BREAK_OPTIONS[0].ornament;

export interface SceneBreakOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    sceneBreak: {
      /** Insert a manual, ornamented scene break at the current selection. */
      setSceneBreak: (ornament?: string) => ReturnType;
    };
  }
}

export const SceneBreak = Node.create<SceneBreakOptions>({
  name: "sceneBreak",

  addOptions() {
    return { HTMLAttributes: {} };
  },

  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      ornament: {
        default: DEFAULT_SCENE_BREAK_ORNAMENT,
        parseHTML: (element) => element.getAttribute("data-ornament") || DEFAULT_SCENE_BREAK_ORNAMENT,
        renderHTML: (attrs) => ({ "data-ornament": attrs.ornament }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="scene-break"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": "scene-break",
        class: "manuscript-scene-break",
      }),
      node.attrs.ornament,
    ];
  },

  addCommands() {
    return {
      setSceneBreak:
        (ornament) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { ornament: ornament || DEFAULT_SCENE_BREAK_ORNAMENT },
          });
        },
    };
  },
});

export default SceneBreak;
