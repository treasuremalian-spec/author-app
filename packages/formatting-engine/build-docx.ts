// Builds a real .docx file in Standard Manuscript Format (the plain,
// double-spaced, Times New Roman layout editors/agents/beta readers
// actually expect for markup -- NOT a styled, book-like layout; that's
// what the PDF/EPUB exports are for). Author request, 2026-09-07: "option
// to export in Word Doc format" for people who want to send their
// manuscript out for editing, plus a matching re-import flow (see
// docx-import.ts) so an edited copy can come back in.
//
// Deliberately built directly from the Tiptap document tree (the same
// DocNode shape tiptap-to-xhtml.ts walks) rather than by converting the
// XHTML tiptap-to-xhtml.ts already produces -- the `docx` npm package
// builds a document out of real Paragraph/TextRun/etc. objects, not
// markup, so going HTML -> back-to-structured-objects would just be
// extra, lossy work for no benefit. This file and tiptap-to-xhtml.ts are
// siblings (same input, two different renderers), not layered.
//
// Deliberately skips inline manuscript images entirely -- standard
// manuscript format is a plain-text editorial document; a screenshot of a
// "spread"/"header"/"caption" image dropped into the middle of a Word doc
// an editor is marking up with track changes would be actively unwanted,
// not just unstyled. Also skips text-message "bubble" styling (rendered
// as a plain paragraph instead) for the same reason: this format is about
// the words an editor needs to read, not the in-app visual presentation.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  PageBreak,
  AlignmentType,
  Header,
  Footer,
  PageNumber,
  LevelFormat,
  convertInchesToTwip,
} from "docx";
import type { DocNode } from "./tiptap-to-xhtml";
import type { EpubChapter, EpubSection, EpubSection as _EpubSection } from "./build-epub";
import { chapterHeadingLabel } from "./page-types";

export interface DocxBookInput {
  title: string;
  author: string;
  sections: EpubSection[];
}

const FONT = "Times New Roman";
const FONT_SIZE_HALF_POINTS = 24; // docx sizes are in half-points -- 24 = 12pt.
const LINE_DOUBLE = 480; // docx line spacing is in 240ths of a line -- 480 = double-spaced.

interface RunMarkProps {
  bold?: boolean;
  italics?: boolean;
  underline?: Record<string, unknown>;
  strike?: boolean;
  font?: string;
}

const MARK_RUN_PROPS: Record<string, RunMarkProps> = {
  bold: { bold: true },
  italic: { italics: true },
  underline: { underline: {} },
  strike: { strike: true },
  code: { font: "Courier New" },
};

function runsFromInline(nodes: DocNode[] | undefined): TextRun[] {
  if (!nodes) return [];
  const runs: TextRun[] = [];
  for (const node of nodes) {
    if (node.type === "text") {
      const text = node.text ?? "";
      if (!text) continue;
      let props: RunMarkProps = {};
      for (const mark of node.marks ?? []) {
        const markProps = MARK_RUN_PROPS[mark.type];
        if (markProps) props = { ...props, ...markProps };
      }
      runs.push(new TextRun({ text, font: FONT, size: FONT_SIZE_HALF_POINTS, ...props }));
    } else if (node.type === "hardBreak") {
      runs.push(new TextRun({ text: "", break: 1, font: FONT, size: FONT_SIZE_HALF_POINTS }));
    } else if (node.content) {
      runs.push(...runsFromInline(node.content));
    }
  }
  return runs;
}

/** Standard manuscript format paragraphs are left-aligned (ragged right,
 * NOT justified -- unlike the print/EPUB exports, which are) with a
 * first-line indent instead of blank lines between paragraphs. */
function bodyParagraph(node: DocNode): Paragraph | null {
  const runs = runsFromInline(node.content);
  if (runs.length === 0) return null;
  return new Paragraph({
    children: runs,
    indent: { firstLine: convertInchesToTwip(0.5) },
    spacing: { line: LINE_DOUBLE, lineRule: "auto" },
    alignment: AlignmentType.LEFT,
  });
}

function sceneBreakParagraph(ornament = "#"): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: ornament, font: FONT, size: FONT_SIZE_HALF_POINTS })],
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_DOUBLE, lineRule: "auto", before: 240, after: 240 },
  });
}

/** Walks one scene's Tiptap doc into a flat list of docx Paragraphs --
 * intentionally handles far fewer node types than tiptap-to-xhtml.ts
 * (no images, no styled text-message bubbles, headings/lists/blockquotes
 * are simply flattened to plain body paragraphs) since a standard
 * manuscript is plain prose, not a styled book page. */
function scenePlainParagraphs(doc: unknown): Paragraph[] {
  const root = doc as DocNode | null | undefined;
  if (!root || !Array.isArray(root.content)) return [];
  const out: Paragraph[] = [];
  for (const node of root.content) {
    switch (node.type) {
      case "paragraph":
      case "heading": {
        const p = bodyParagraph(node);
        if (p) out.push(p);
        break;
      }
      case "bulletList":
      case "orderedList":
        for (const item of node.content ?? []) {
          for (const child of item.content ?? []) {
            const p = bodyParagraph(child);
            if (p) out.push(p);
          }
        }
        break;
      case "blockquote":
        for (const child of node.content ?? []) {
          const p = bodyParagraph(child);
          if (p) out.push(p);
        }
        break;
      case "sceneBreak": {
        const ornament = typeof node.attrs?.ornament === "string" ? node.attrs.ornament : "#";
        out.push(sceneBreakParagraph(ornament));
        break;
      }
      case "textMessage": {
        // Rendered as a plain paragraph -- see the file-level comment for
        // why the visual "bubble" styling is deliberately dropped here.
        const p = bodyParagraph(node);
        if (p) out.push(p);
        break;
      }
      case "pageBreak":
        out.push(new Paragraph({ children: [new PageBreak()] }));
        break;
      case "manuscriptImage":
        // Deliberately skipped -- see the file-level comment.
        break;
      default:
        break;
    }
  }
  return out;
}

function isSceneEmpty(doc: unknown): boolean {
  const root = doc as DocNode | null | undefined;
  if (!root || !Array.isArray(root.content)) return true;
  const hasText = (node: DocNode): boolean => {
    if (node.type === "text" && (node.text ?? "").trim()) return true;
    return (node.content ?? []).some(hasText);
  };
  return !root.content.some(hasText);
}

function chapterHeading(label: string): Paragraph {
  return new Paragraph({
    children: [new PageBreak(), new TextRun({ text: label, font: FONT, size: FONT_SIZE_HALF_POINTS, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: convertInchesToTwip(1.5), after: label ? 240 : 480 },
  });
}

/** The per-chapter byline paragraph ("Add Chapter Author"), directly
 * under chapterHeading -- for multi-author anthologies/collections. */
function chapterAuthorLine(name: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `by ${name}`, font: FONT, size: FONT_SIZE_HALF_POINTS, italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 480 },
  });
}

function partHeading(title: string): Paragraph {
  return new Paragraph({
    children: [new PageBreak(), new TextRun({ text: title.toUpperCase(), font: FONT, size: FONT_SIZE_HALF_POINTS, bold: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: convertInchesToTwip(2.5), after: 480 },
  });
}

/** "Lastname / KEYWORD / #" running header -- the conventional Shunn
 * manuscript-format running head, minus a contact-info block (this app
 * doesn't collect an author's mailing address/phone, which a from-scratch
 * submission-ready manuscript would traditionally carry on its title
 * page; everything else about the format is faithful). */
function runningHeader(author: string, title: string): Header {
  const lastName = author.trim().split(/\s+/).pop() || author.trim() || "Author";
  const keyword = (title.trim().split(/\s+/)[0] || title || "Manuscript").toUpperCase();
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ text: `${lastName} / ${keyword} / `, font: FONT, size: 20 }),
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 20 }),
        ],
      }),
    ],
  });
}

/** Builds a Standard Manuscript Format .docx and returns it as a Buffer,
 * ready to send as a download. */
export async function buildManuscriptDocx(book: DocxBookInput): Promise<Buffer> {
  const bodyChildren: Paragraph[] = [];

  // Title page -- centered title/byline, no running header (docx's
  // titlePage: true + a separate first-page header handles that), roughly
  // a third of the way down the page like a real manuscript submission.
  bodyChildren.push(
    new Paragraph({ spacing: { before: convertInchesToTwip(2.2) }, children: [] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: book.title || "Untitled", font: FONT, size: 28, bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240 },
      children: [new TextRun({ text: `by ${book.author || "Unknown Author"}`, font: FONT, size: FONT_SIZE_HALF_POINTS })],
    })
  );

  let chapterNumber = 0;

  function pushChapterHeading(chapter: EpubChapter) {
    if (chapter.pageType === "CHAPTER") chapterNumber += 1;
    const label = chapterHeadingLabel({
      pageType: chapter.pageType,
      title: chapter.title,
      numbered: chapter.numbered,
      chapterNumber,
    });
    // No book-wide "show chapter titles" setting exists for this format
    // (Standard Manuscript Format always shows them) -- only an explicit
    // per-chapter override can suppress one.
    const showHeading = (chapter.showHeadingOverride ?? true) && !!label;
    if (showHeading) {
      bodyChildren.push(chapterHeading(label));
      if (chapter.chapterAuthor?.trim()) bodyChildren.push(chapterAuthorLine(chapter.chapterAuthor.trim()));
    } else {
      // Still needs its own fresh page even with the heading hidden.
      bodyChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }
  }

  for (const section of book.sections) {
    if (section.kind === "part") {
      bodyChildren.push(partHeading(section.part.title));
      for (const chapter of section.part.chapters) {
        pushChapterHeading(chapter);
        let seenFirstScene = false;
        for (const scene of chapter.scenes) {
          if (isSceneEmpty(scene.content)) continue;
          if (seenFirstScene) bodyChildren.push(sceneBreakParagraph());
          bodyChildren.push(...scenePlainParagraphs(scene.content));
          seenFirstScene = true;
        }
      }
    } else {
      pushChapterHeading(section.chapter);
      let seenFirstScene = false;
      for (const scene of section.chapter.scenes) {
        if (isSceneEmpty(scene.content)) continue;
        if (seenFirstScene) bodyChildren.push(sceneBreakParagraph());
        bodyChildren.push(...scenePlainParagraphs(scene.content));
        seenFirstScene = true;
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
            },
          },
          titlePage: true,
        },
        headers: {
          default: runningHeader(book.author, book.title),
          first: new Header({ children: [new Paragraph({ children: [] })] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph({ children: [] })] }),
        },
        children: bodyChildren,
      },
    ],
    numbering: { config: [{ reference: "manuscript-none", levels: [{ level: 0, format: LevelFormat.NONE, text: "", alignment: AlignmentType.LEFT }] }] },
  });

  return Packer.toBuffer(doc);
}
