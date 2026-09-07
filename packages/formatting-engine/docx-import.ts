// Parses an uploaded .docx manuscript into chapters of plain Tiptap
// document JSON -- the reverse direction of build-docx.ts, used by two
// author-requested flows (2026-09-07): starting a brand-new project from
// a manuscript someone began writing in Word, and re-importing an edited
// copy of an exported manuscript to replace an existing project's content
// (see apps/web/lib/actions/docx-import.ts for what does what with the
// result).
//
// Built on `mammoth` (docx -> HTML) rather than parsing the raw docx XML
// directly -- mammoth already solves the genuinely hard part (Word's own
// document.xml is a deep, quirky OOXML tree; mammoth turns it into plain,
// mostly-flat HTML using each paragraph's named style, e.g. a "Heading 1"
// paragraph style becomes a real <h1>). What's parsed here is deliberately
// narrow: paragraph text plus bold/italic/underline emphasis, split into
// chapters at heading boundaries -- this is meant to get a writer's
// existing prose and chapter breaks into the app cleanly, not to
// reconstruct arbitrary Word formatting (tables, images, footnotes,
// comments, etc. are not preserved; see the module comment in
// build-docx.ts for the parallel decision on the export side).
//
// Hand-written against mammoth's actual (simple, mostly-flat) HTML output
// with small regexes, rather than pulling in a full DOM/HTML parser
// dependency -- consistent with this package's existing style (see
// tiptap-to-xhtml.ts's own file comment on the same choice for the same
// reason).

import mammoth from "mammoth";
import type { DocNode } from "./tiptap-to-xhtml";

export interface ParsedChapter {
  title: string;
  /** A single scene's worth of Tiptap document JSON for this chapter. */
  content: { type: "doc"; content: DocNode[] };
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text.replace(/&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith("#")) {
      return String.fromCodePoint(parseInt(code.slice(1), 10));
    }
    return ENTITIES[code] ?? full;
  });
}

const INLINE_TOKEN_RE = /<(strong|b|em|i|u)>([\s\S]*?)<\/\1>|([^<]+)|<[^>]+>/g;

const MARK_FOR_TAG: Record<string, string> = {
  strong: "bold",
  b: "bold",
  em: "italic",
  i: "italic",
  u: "underline",
};

/** Turns one paragraph's inner HTML (mammoth's output for a single <p>,
 * inline tags only -- no nested block elements) into Tiptap inline
 * content nodes, applying bold/italic/underline marks as appropriate.
 * Doesn't handle marks nested inside OTHER marks (e.g. bold-and-italic
 * text) -- mammoth doesn't nest simple run-formatting tags that way in
 * practice (it emits sibling tags per distinct formatting run instead),
 * so this stays a flat single-pass walk rather than a real recursive
 * parser. */
function parseInlineHtml(innerHtml: string): DocNode[] {
  const nodes: DocNode[] = [];
  let match: RegExpExecArray | null;
  INLINE_TOKEN_RE.lastIndex = 0;
  while ((match = INLINE_TOKEN_RE.exec(innerHtml))) {
    const [, tag, tagContent, plainText] = match;
    if (tag) {
      const innerText = decodeEntities(tagContent.replace(/<[^>]+>/g, ""));
      if (!innerText) continue;
      const markType = MARK_FOR_TAG[tag];
      nodes.push({ type: "text", text: innerText, marks: markType ? [{ type: markType }] : undefined });
    } else if (plainText) {
      const text = decodeEntities(plainText);
      if (text) nodes.push({ type: "text", text });
    }
    // A bare tag we don't recognize (e.g. mammoth's occasional <a> around
    // a cross-reference) is simply skipped -- its match falls into the
    // catch-all "<[^>]+>" alternative, whose group is empty, so the loop
    // just continues past it without emitting a node.
  }
  return nodes;
}

function paragraphNode(innerHtml: string): DocNode | null {
  const inline = parseInlineHtml(innerHtml);
  if (inline.length === 0) return null;
  return { type: "paragraph", content: inline };
}

interface HeadingMatch {
  start: number;
  end: number;
  title: string;
}

function findHeadings(html: string): HeadingMatch[] {
  const headingRe = /<h[1-3]>([\s\S]*?)<\/h[1-3]>/g;
  const out: HeadingMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = headingRe.exec(html))) {
    const title = decodeEntities(m[1].replace(/<[^>]+>/g, "")).trim();
    out.push({ start: m.index, end: m.index + m[0].length, title });
  }
  return out;
}

/** Turns one chapter's worth of HTML (everything between one heading and
 * the next, or the whole document when there are no headings) into a
 * Tiptap document -- one paragraph node per <p>, in order. Non-paragraph
 * block content mammoth might emit (e.g. a <table> from a Word table) is
 * skipped rather than guessed at. */
function chapterBodyToDoc(html: string): { type: "doc"; content: DocNode[] } {
  const content: DocNode[] = [];
  const paraRe = /<p>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(html))) {
    const node = paragraphNode(m[1]);
    if (node) content.push(node);
  }
  if (content.length === 0) content.push({ type: "paragraph" });
  return { type: "doc", content };
}

/** Splits mammoth's HTML output into chapters at heading (h1/h2/h3)
 * boundaries. A document with no headings at all becomes a single
 * chapter -- most first-time Word manuscripts use blank lines or "***"
 * for scene breaks rather than Word's Heading styles, and a whole
 * unbroken manuscript is still far more useful landing in the app as one
 * (long) chapter the author can then split up than being rejected for
 * lacking structure mammoth can't infer on its own. */
export function splitIntoChapters(html: string, fallbackTitle: string): ParsedChapter[] {
  const headings = findHeadings(html);

  if (headings.length === 0) {
    return [{ title: fallbackTitle, content: chapterBodyToDoc(html) }];
  }

  const chapters: ParsedChapter[] = [];

  // Anything before the first heading (a title page, an epigraph, etc.
  // mammoth didn't tag as a heading) becomes its own leading chapter only
  // if it actually has real paragraph text -- otherwise it's silently
  // dropped rather than inserted as a confusing empty first chapter.
  const leading = html.slice(0, headings[0].start);
  const leadingDoc = chapterBodyToDoc(leading);
  const leadingHasText = leadingDoc.content.some((n) => (n.content ?? []).some((t) => (t.text ?? "").trim()));
  if (leadingHasText) {
    chapters.push({ title: fallbackTitle, content: leadingDoc });
  }

  for (let i = 0; i < headings.length; i++) {
    const heading = headings[i];
    const bodyStart = heading.end;
    const bodyEnd = i + 1 < headings.length ? headings[i + 1].start : html.length;
    const body = html.slice(bodyStart, bodyEnd);
    chapters.push({ title: heading.title || `Chapter ${chapters.length + 1}`, content: chapterBodyToDoc(body) });
  }

  return chapters;
}

/** Reads a .docx file's raw bytes and returns its chapters, ready to
 * become ManuscriptNode/Scene rows (see apps/web/lib/actions/
 * docx-import.ts, which does that DB work for both the "new project" and
 * "replace this project" flows). */
export async function parseManuscriptDocx(buffer: Buffer, fallbackTitle: string): Promise<ParsedChapter[]> {
  const { value: html } = await mammoth.convertToHtml({ buffer });
  return splitIntoChapters(html, fallbackTitle);
}
