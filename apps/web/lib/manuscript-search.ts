// Book-wide "search words or phrases to jump to it" (author request,
// 2026-09-11). A chapter's content is stored as Tiptap/ProseMirror JSON,
// not plain text (see wordcount.ts's own comment) -- finding a match's
// exact, jumpable position means building a REAL ProseMirror document
// from that JSON and using its own position semantics, not hand-rolling a
// parallel one, which is easy to get subtly wrong around marks/atoms/
// block boundaries. getSchema() + Node.fromJSON() (both real @tiptap/pm
// -- prosemirror-model underneath) give an actual PM `Node` with the same
// position numbering a live, mounted editor for that exact content would
// have, entirely headless -- no browser/DOM needed, so this runs
// identically in the browser (building the results list across every
// chapter, most of which aren't mounted) and on the server (the
// Replace All action, see actions/manuscript-search.ts).
//
// Position mapping approach: walk every text node in document order,
// concatenating their text with NO separator inserted at block
// boundaries (deliberately -- a match is only ever looked for within
// text that's genuinely adjacent on the page; two words in different
// paragraphs joining into an accidental match is the accepted, low-stakes
// edge case). Record each text node's real PM position alongside its
// slice of the concatenation, then map a found substring's character
// range back to real PM positions via that record.
import { getSchema } from "@tiptap/core";
import { Node as PMNode } from "@tiptap/pm/model";
import { EDITOR_EXTENSIONS } from "@/components/manuscript/extensions/editor-extensions";

let cachedSchema: ReturnType<typeof getSchema> | null = null;
function schema() {
  if (!cachedSchema) cachedSchema = getSchema(EDITOR_EXTENSIONS);
  return cachedSchema;
}

/** Builds a real, headless ProseMirror document from a scene's stored
 * Tiptap JSON. Returns null for content that doesn't parse against the
 * current schema (shouldn't happen for anything the real editor saved,
 * but a scene predating some now-removed extension is a real possibility
 * over the life of this app -- fails soft rather than crashing the whole
 * search). */
export function docFromContent(content: unknown): PMNode | null {
  try {
    return PMNode.fromJSON(schema(), content);
  } catch {
    return null;
  }
}

interface TextRun {
  pos: number; // real PM position of this run's first character
  len: number;
}

function buildFlatIndex(doc: PMNode): { text: string; runs: TextRun[] } {
  let text = "";
  const runs: TextRun[] = [];
  doc.descendants((node, pos) => {
    if (node.isText && node.text) {
      runs.push({ pos, len: node.text.length });
      text += node.text;
    }
    return true;
  });
  return { text, runs };
}

// Maps a character index into the flat concatenation back to a real PM
// position. `side` matters at a run boundary: a match's END index can
// legitimately equal "one past the last character of run N" -- that has
// to resolve to run N's own end position (pos + len), never accidentally
// spill into run N+1's start, which -- unless the two runs are truly
// adjacent in the document (no block boundary between them) -- is a
// different, non-adjacent real position.
function posAt(runs: TextRun[], charIndex: number, side: "start" | "end"): number {
  let cum = 0;
  for (const run of runs) {
    const withinStart = side === "start" && charIndex >= cum && charIndex < cum + run.len;
    const withinEnd = side === "end" && charIndex > cum && charIndex <= cum + run.len;
    if (withinStart || withinEnd) return run.pos + (charIndex - cum);
    cum += run.len;
  }
  if (runs.length === 0) return 0;
  if (charIndex <= 0) return runs[0].pos;
  const last = runs[runs.length - 1];
  return last.pos + last.len;
}

export interface SearchMatch {
  from: number;
  to: number;
  snippet: string;
}

const SNIPPET_RADIUS = 42;

function buildSnippet(text: string, start: number, end: number): string {
  const from = Math.max(0, start - SNIPPET_RADIUS);
  const to = Math.min(text.length, end + SNIPPET_RADIUS);
  const prefix = from > 0 ? "…" : "";
  const suffix = to < text.length ? "…" : "";
  // Collapse runs of whitespace so a snippet spanning a paragraph/list-item
  // boundary (no separator in the flat text, see module comment) doesn't
  // read as two words jammed together with no space at all -- purely
  // cosmetic, doesn't affect the real match position.
  return (prefix + text.slice(from, to) + suffix).replace(/\s+/g, " ");
}

/** Finds every occurrence of `query` in `doc`'s real text content,
 * case-insensitive by default. Matches are non-overlapping (advances past
 * each match before looking for the next). */
export function findMatches(doc: PMNode, query: string, opts?: { caseSensitive?: boolean }): SearchMatch[] {
  const trimmed = query;
  if (!trimmed) return [];

  const { text, runs } = buildFlatIndex(doc);
  const caseSensitive = opts?.caseSensitive ?? false;
  const haystack = caseSensitive ? text : text.toLowerCase();
  const needle = caseSensitive ? trimmed : trimmed.toLowerCase();

  const matches: SearchMatch[] = [];
  let searchFrom = 0;
  while (searchFrom <= haystack.length) {
    const idx = haystack.indexOf(needle, searchFrom);
    if (idx === -1) break;
    const endIdx = idx + needle.length;
    matches.push({
      from: posAt(runs, idx, "start"),
      to: posAt(runs, endIdx, "end"),
      snippet: buildSnippet(text, idx, endIdx),
    });
    searchFrom = endIdx;
  }
  return matches;
}

export interface ChapterSearchResult {
  nodeId: string;
  title: string;
  matches: SearchMatch[];
}

/** Runs findMatches() across every chapter's stored content -- the
 * client-side book search index. `chapters` is deliberately just
 * {id, title, content}, not the full ManuscriptNodeData shape, so this
 * stays usable from anywhere that already has scene content in hand. */
export function searchBook(
  chapters: { id: string; title: string; content: unknown }[],
  query: string,
  opts?: { caseSensitive?: boolean }
): ChapterSearchResult[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const results: ChapterSearchResult[] = [];
  for (const chapter of chapters) {
    const doc = docFromContent(chapter.content);
    if (!doc) continue;
    const matches = findMatches(doc, trimmed, opts);
    if (matches.length > 0) {
      results.push({ nodeId: chapter.id, title: chapter.title, matches });
    }
  }
  return results;
}

// --- Replace All ------------------------------------------------------
//
// Deliberately walks the raw Tiptap JSON (not the PM doc) and only
// replaces occurrences that live ENTIRELY inside a single text node's own
// `text` string -- never across two adjacent text nodes/marks. That's
// what keeps a replacement's formatting correct for free: staying inside
// one text node means the replacement text inherits that exact node's
// marks automatically, no separate mark-merging logic needed. The cost is
// that a match split across a formatting boundary (e.g. "auto" bold +
// "save" plain forming "autosave") is left untouched -- reported as
// "skipped" by comparing this count against findMatches()'s real,
// boundary-crossing-aware total (see actions/manuscript-search.ts), so
// nothing is silently dropped without being counted somewhere.
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface JsonNode {
  type?: string;
  text?: string;
  content?: JsonNode[];
  [key: string]: unknown;
}

export function replaceWithinTextNodes(
  content: unknown,
  query: string,
  replacement: string,
  caseSensitive: boolean
): { content: unknown; replacedCount: number } {
  let replacedCount = 0;
  const pattern = new RegExp(escapeRegExp(query), caseSensitive ? "g" : "gi");

  function walk(node: unknown): unknown {
    if (node && typeof node === "object") {
      const n = node as JsonNode;
      if (n.type === "text" && typeof n.text === "string") {
        const matches = n.text.match(pattern);
        if (matches && matches.length > 0) {
          replacedCount += matches.length;
          return { ...n, text: n.text.replace(pattern, replacement) };
        }
        return n;
      }
      if (Array.isArray(n.content)) {
        return { ...n, content: n.content.map(walk) };
      }
    }
    return node;
  }

  return { content: walk(content), replacedCount };
}
