// The ONE list of Tiptap extensions a scene's document is built from --
// shared by SceneEditor.tsx (the live, DOM-mounted editor) and
// manuscript-search.ts (a headless ProseMirror schema used to find book-
// wide search matches and their real document positions without needing
// a live editor instance for every chapter). Extracted 2026-09-11 so the
// two can never drift apart -- a search match's {from, to} position is
// only meaningful if it's computed against the EXACT SAME schema the real
// editor uses; two separately-maintained extension lists would be exactly
// the kind of silent-disagreement bug this project has hit before (see
// chapterHeadingLabel()/resolveSections()/resolveChapterScenes() for the
// established "one shared place" pattern this follows).
//
// Safe to import from a plain (non-"use client") module and call
// getSchema() on in Node.js with no DOM: this only reads each extension's
// static type/attrs/content/marks config, never renders anything.
// ManuscriptImage's addNodeView (a React component) is a runtime-only
// callback Tiptap invokes when the editor actually mounts in a browser --
// getSchema() never touches it.
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import type { AnyExtension } from "@tiptap/core";

import { PageBreak } from "./page-break";
import { SceneBreak } from "./scene-break";
import { TextMessage } from "./text-message";
import { ManuscriptImage } from "./manuscript-image";

export const EDITOR_EXTENSIONS: AnyExtension[] = [
  StarterKit,
  Underline,
  TextAlign.configure({ types: ["heading", "paragraph", "textMessage"] }),
  Placeholder.configure({ placeholder: "Start writing..." }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    linkOnPaste: true,
    HTMLAttributes: { rel: "noopener noreferrer" },
  }),
  PageBreak,
  SceneBreak,
  TextMessage,
  ManuscriptImage,
];
