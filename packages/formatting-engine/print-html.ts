// Builds one complete, self-contained HTML document for a book's print
// edition: a title page (no cover image -- print/PDF export is
// deliberately cover-less, per author request; the EPUB export is the
// one that gets the cover, see build-epub.ts), part dividers, and
// chapters with running headers, page numbers, and chapter-start pages --
// using standard CSS Paged Media
// rules (@page, string-set, named pages) that the Paged.js polyfill (see
// render-pdf.ts) turns into real, fixed-size, paginated pages before we
// hand the result to a real headless browser to print as a PDF.
//
// Deliberately built as one flat HTML document rather than per-chapter
// files (unlike the EPUB build) -- Paged.js needs the whole book in one
// flow to paginate it correctly, with page breaks as a side effect of
// CSS rather than a structural choice we make ourselves.
//
// Body text uses an embedded font (Crimson Pro, see fonts-embedded.ts)
// rather than naming Georgia/Times and hoping the renderer has them --
// @sparticuz/chromium's serverless Chromium build has no such fonts
// installed, and was silently substituting a generic sans-serif for
// every character, which is why print exports looked visibly different
// (lighter, airier, sans-serif) from a same-size Vellum-exported
// reference book despite having correct page size and margins.
// Confirmed 2026-09-06 by inspecting a real exported PDF's embedded font
// resource names directly.
//
// PrintOptions (added 2026-09-06, Phase 15) exposes a handful of
// print-typesetting choices Vellum offers that were previously hardcoded:
// mirrored inside/outside margins, whether paragraphs are indented, line
// spacing, drop caps at chapter starts, and whether every chapter is
// forced to start on a right-hand page. All are optional with defaults
// matching the previous hardcoded behavior, so existing exports (no
// options passed) are unchanged.

import { sceneContentToXhtml, isSceneContentEmpty, escapeXml } from "./tiptap-to-xhtml";
import type { EpubBookInput, EpubChapter, EpubPart, EpubSection } from "./build-epub";
import {
  CRIMSON_PRO_REGULAR,
  CRIMSON_PRO_ITALIC,
  CRIMSON_PRO_BOLD,
  CRIMSON_PRO_BOLD_ITALIC,
} from "./fonts-embedded";

export type TrimSize = "5x8" | "6x9";

export const TRIM_SIZE_DIMENSIONS: Record<TrimSize, { width: string; height: string; label: string }> = {
  "5x8": { width: "5in", height: "8in", label: '5" x 8" (mass market / digest)' },
  "6x9": { width: "6in", height: "9in", label: '6" x 9" (trade paperback)' },
};

export interface PrintBookInput extends EpubBookInput {
  trimSize: TrimSize;
}

/** Print-typesetting options -- see the file-level comment above. Every field is optional; omitted fields fall back to DEFAULT_PRINT_OPTIONS, which match this file's previous hardcoded behavior. */
export interface PrintOptions {
  /** Bigger margin toward the spine (inside) than the outside edge, alternating by page side, instead of equal margins on every page. */
  mirroredMargins?: boolean;
  /** Indent the first line of each paragraph. When false, paragraphs are set block-style with a small gap between them instead. */
  indentParagraphs?: boolean;
  /** Body text line-height multiplier. */
  lineSpacing?: number;
  /** Enlarge the first letter of each chapter's opening paragraph into a drop cap. */
  dropCaps?: boolean;
  /** Force every chapter (and part) to start on a right-hand page, inserting a blank page when needed. */
  chapterStartsOnRight?: boolean;
}

const DEFAULT_PRINT_OPTIONS: Required<PrintOptions> = {
  mirroredMargins: false,
  indentParagraphs: true,
  lineSpacing: 1.5,
  dropCaps: false,
  chapterStartsOnRight: false,
};

function sceneHtml(content: unknown, isFirstNonEmptyInChapter: boolean): string {
  const divider = isFirstNonEmptyInChapter ? "" : `<p class="scene-break">⁂</p>\n`;
  return `${divider}${sceneContentToXhtml(content)}`;
}

// Marks the very first paragraph of a chapter with an explicit class (for
// the text-indent reset), and wraps its literal first character in its
// own <span> for the drop cap -- rather than a ".chapter-start +
// p::first-letter" pseudo-element selector, which silently failed in a
// real local test render (confirmed 2026-09-06). Digging further (also
// 2026-09-06) found the real cause is broader than that first guess:
// Paged.js ships a built-in stylesheet rule that force-resets
// "::first-letter" styling (font-size, float, etc back to "unset") on any
// element it treats as continuing/starting fresh content on a new page --
// which, empirically, includes the first element Paged.js flows onto a
// page after a CSS-forced break-before, not just an actual paragraph
// split. Since our chapter-opening paragraph is always exactly that (it
// always follows a break-before on the preceding chapter-start element),
// no ::first-letter selector was ever going to survive there. Wrapping
// the first character in a real <span> sidesteps the problem entirely --
// it's a literal element, not a pseudo-element, so Paged.js's reset rule
// (which is scoped to "::first-letter" specifically) never touches it.
//
// The "first letter" is extracted unit-aware: scene content is passed
// through escapeXml before it ever reaches here, so a paragraph starting
// with an apostrophe, quote, or ampersand may begin with a multi-character
// HTML entity (e.g. "&#39;") rather than a single literal character --
// splitting on raw string index would cut an entity in half and corrupt
// the HTML. The regex below grabs a whole entity when present, otherwise
// one Unicode character (the "u" flag keeps astral-plane characters, like
// some emoji, intact rather than splitting a surrogate pair).
//
// Before that, though, any leading inline formatting tags (an opening
// paragraph that's entirely italicized -- a common convention for a
// prologue or flashback -- comes through as "<em>The smell of...") are
// peeled off first. Confirmed 2026-09-06 from a real exported page: without
// this, the regex above has no concept of HTML at all, so it happily
// grabbed the "<" that starts "<em>" as if it were the first LETTER,
// wrapped just that "<" in the drop-cap span, and left "em>" sitting in
// the text as broken, visible markup. Skipping past whatever opening tags
// come first means the drop cap span ends up correctly nested inside them
// (e.g. "<em><span class="chapter-drop-cap">T</span>he smell...") instead
// of splitting a tag in half.
function markChapterFirstParagraph(html: string): string {
  const openTagMatch = /<p([^>]*)>/.exec(html);
  if (!openTagMatch || openTagMatch.index === undefined) return html;

  const [fullOpenTag, attrs] = openTagMatch;
  const before = html.slice(0, openTagMatch.index);
  let after = html.slice(openTagMatch.index + fullOpenTag.length);
  const newOpenTag = `<p class="chapter-first-paragraph"${attrs}>`;

  let leadingTags = "";
  const leadingTagRe = /^<[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?>/;
  let leadingTagMatch: RegExpExecArray | null;
  while ((leadingTagMatch = leadingTagRe.exec(after))) {
    leadingTags += leadingTagMatch[0];
    after = after.slice(leadingTagMatch[0].length);
  }

  const unitMatch = /^(&(?:#\d+|#x[0-9a-fA-F]+|[a-zA-Z]+);|.)/u.exec(after);
  if (!unitMatch) {
    // Empty paragraph, or text starts with something else unsafe to split
    // (e.g. another nested tag right away) -- nothing safe to wrap, so
    // just apply the text-indent-reset class and leave content as-is.
    return `${before}${newOpenTag}${leadingTags}${after}`;
  }

  const firstUnit = unitMatch[0];
  const rest = after.slice(firstUnit.length);
  return `${before}${newOpenTag}${leadingTags}<span class="chapter-drop-cap">${firstUnit}</span>${rest}`;
}

function chapterHtml(chapter: EpubChapter, chapterNumber: number): string {
  const label = chapter.title?.trim() || `Chapter ${chapterNumber}`;
  let seenFirstScene = false;
  const scenesHtml = chapter.scenes
    .filter((scene) => !isSceneContentEmpty(scene.content))
    .map((scene) => {
      const html = sceneHtml(scene.content, !seenFirstScene);
      seenFirstScene = true;
      return html;
    })
    .join("\n");
  const markedScenesHtml = markChapterFirstParagraph(scenesHtml);

  return `<section class="chapter">
  <div class="chapter-start">
    <h1 class="chapter-title">${escapeXml(label)}</h1>
  </div>
  ${markedScenesHtml}
</section>`;
}

function partHtml(part: EpubPart, chapterNumberStart: number): { html: string; nextChapterNumber: number } {
  let chapterNumber = chapterNumberStart;
  const chaptersHtml = part.chapters
    .map((chapter) => {
      const html = chapterHtml(chapter, chapterNumber);
      chapterNumber += 1;
      return html;
    })
    .join("\n");

  const html = `<section class="part-divider">
  <p class="part-label">Part</p>
  <h1>${escapeXml(part.title)}</h1>
</section>
${chaptersHtml}`;

  return { html, nextChapterNumber: chapterNumber };
}

function buildCss(trimSize: TrimSize, options: Required<PrintOptions>): string {
  const { width, height } = TRIM_SIZE_DIMENSIONS[trimSize];
  const { mirroredMargins, indentParagraphs, lineSpacing, dropCaps, chapterStartsOnRight } = options;

  // Base margins (top/right/bottom/left), used as-is when mirroredMargins
  // is off. When it's on, left/right are instead driven by the :left/
  // :right page-side rules below, with a slightly bigger inside (spine)
  // margin than outside -- matching real print-book convention (and
  // roughly what a real Vellum-exported reference book measured at:
  // ~0.875in inside / ~0.62in outside, confirmed 2026-09-06).
  const marginTop = "0.8in";
  const marginBottom = "0.9in";
  const marginOutside = "0.6in";
  const marginInside = "0.85in";
  const baseMargin = mirroredMargins ? "" : `margin: ${marginTop} 0.65in ${marginBottom} 0.65in;`;
  const chapterBreak = chapterStartsOnRight ? "recto" : "page";

  return `
/* Embedded print font (Crimson Pro, SIL Open Font License) -- see
   fonts-embedded.ts for why this is embedded as font data rather than
   left as a font-family name for the renderer to resolve on its own. */
@font-face {
  font-family: "CrimsonPro";
  font-style: normal;
  font-weight: 400;
  src: url(data:font/woff2;base64,${CRIMSON_PRO_REGULAR}) format("woff2");
}
@font-face {
  font-family: "CrimsonPro";
  font-style: italic;
  font-weight: 400;
  src: url(data:font/woff2;base64,${CRIMSON_PRO_ITALIC}) format("woff2");
}
@font-face {
  font-family: "CrimsonPro";
  font-style: normal;
  font-weight: 700;
  src: url(data:font/woff2;base64,${CRIMSON_PRO_BOLD}) format("woff2");
}
@font-face {
  font-family: "CrimsonPro";
  font-style: italic;
  font-weight: 700;
  src: url(data:font/woff2;base64,${CRIMSON_PRO_BOLD_ITALIC}) format("woff2");
}
@page {
  size: ${width} ${height};
  ${baseMargin}
  @top-center {
    content: string(chaptertitle);
    font-family: "CrimsonPro", Georgia, "Times New Roman", serif;
    font-size: 8.5pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #666;
  }
  @bottom-center {
    content: counter(page);
    font-family: "CrimsonPro", Georgia, "Times New Roman", serif;
    font-size: 9pt;
    color: #333;
  }
}
${
  mirroredMargins
    ? `/* Recto (right-hand) pages: spine is on the left, so the inside
   margin is the LEFT margin. Verso (left-hand) pages: spine is on the
   right, so the inside margin is the RIGHT margin. */
@page :right {
  margin: ${marginTop} ${marginOutside} ${marginBottom} ${marginInside};
}
@page :left {
  margin: ${marginTop} ${marginInside} ${marginBottom} ${marginOutside};
}
`
    : ""
}
@page :first {
  @top-center { content: none; }
  @bottom-center { content: none; }
}
@page titlepage {
  @top-center { content: none; }
  @bottom-center { content: none; }
}
/* Chapter-opening pages hide the running header (the big chapter title
   right there makes it redundant) -- but NOT via a named "chapterstart"
   CSS page the way this used to work. That named-page approach forced an
   unwanted page break between the chapter title and its own opening
   paragraph (a CSS Paged Media page always breaks when the "page" name
   changes between adjacent content, and the title/body would've needed
   the SAME name to share a page -- see the .chapter-start comment below).
   And once title and body share the same name, "@page chapterstart:first"
   turned out NOT to mean "first page of each chapter" as hoped -- tested
   locally 2026-09-06 and confirmed Paged.js (like the CSS Paged Media
   spec itself) resolves ":first" against the first page of that name IN
   THE WHOLE DOCUMENT, not per contiguous run -- so it fired for chapter
   one's opening page and never again for chapter two's, three's, etc.
   Fixed with a real per-page marker instead: render-pdf.ts finds every
   Paged.js page box whose content includes a .chapter-start element right
   after pagination finishes, and tags it with this class directly. */
.pagedjs_page_chapter_start .pagedjs_margin-top-center {
  visibility: hidden;
}

html, body {
  margin: 0;
  padding: 0;
}
body {
  font-family: "CrimsonPro", Georgia, "Times New Roman", serif;
  font-size: 11.5pt;
  line-height: ${lineSpacing};
  color: #1a1a1a;
}
p {
  margin: 0;
  text-align: justify;
  text-indent: ${indentParagraphs ? "1.5em" : "0"};
  orphans: 2;
  widows: 2;
  hyphens: auto;
  ${indentParagraphs ? "" : `margin-bottom: 0.9em;`}
}
.chapter-start + p,
.chapter-first-paragraph,
.scene-break + p {
  text-indent: 0;
}
.scene-break {
  text-align: center;
  text-indent: 0;
  margin: 1em 0;
  letter-spacing: 0.3em;
}
/* A writer-inserted manual page break (see tiptap-to-xhtml.ts's
   "pageBreak" case and apps/web/components/manuscript/extensions/
   page-break.ts) -- an empty marker div that forces a real Paged.js page
   break right after it, the same break-after mechanism already used
   above for .titlepage/.part-divider. Distinct from the automatic
   chapter/scene breaks elsewhere in this file: this one only exists
   because the writer explicitly placed it mid-scene. */
.manual-page-break {
  break-after: page;
  height: 0;
  margin: 0;
  padding: 0;
}
h2, h3, h4, h5, h6 {
  font-family: "CrimsonPro", Georgia, "Times New Roman", serif;
  text-indent: 0;
  margin: 1em 0 0.5em;
}
${
  dropCaps
    ? `/* Drop cap on each chapter's opening paragraph. This targets a real
   <span> (see markChapterFirstParagraph in this file) rather than a
   ::first-letter pseudo-element -- Paged.js resets ::first-letter styling
   on content that starts a fresh page after a forced break, which is
   exactly what this paragraph always is. */
.chapter-drop-cap {
  float: left;
  font-size: 3.6em;
  /* line-height: 1 (rather than a fraction like 0.82) is what makes the
     cap's own box height land close to a clean 2-line span at this
     font-size -- the earlier 0.82 was tuned by feel, not measured, and
     combined with a padding-top nudge to "fix" the resulting misalignment,
     it actually made things worse: confirmed 2026-09-06 from a real user
     screenshot showing the letter sitting a full ~28pt too low (verified
     by pixel-measuring the actual rendered ink, not PDF text-run bounding
     boxes -- those reflect font ascent metrics, not where the glyph's
     ink visually starts, which is what had thrown off the earlier fix). */
  line-height: 1;
  font-weight: 700;
  /* Stays upright even when it lands inside italicized opening text (e.g.
     a prologue/flashback paragraph) -- a huge, floated italic letter reads
     as a rendering glitch rather than a deliberate design choice. */
  font-style: normal;
  padding-right: 0.08em;
  /* Levels the top of the drop cap with the top of the first line of body
     text next to it -- tuned empirically against Crimson Pro's real
     metrics by pixel-measuring the actual rendered ink in a real local
     PDF (not guessed, and not from PDF text-run bounding boxes, which
     misled the previous attempt at this). Margin, not padding, since the
     needed nudge is upward and padding cannot go negative. Would need
     re-tuning if the print font ever changes. */
  margin-top: -0.16em;
}
`
    : ""
}

.titlepage, .part-divider {
  page: titlepage;
  break-after: page;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.titlepage {
  /* Always the very first page -- no need for recto/verso logic here. */
  break-before: page;
}
.part-divider {
  break-before: ${chapterBreak};
}
.titlepage h1 {
  font-size: 26pt;
  margin: 0 0 0.4in;
  text-indent: 0;
}
.titlepage .byline {
  font-size: 13pt;
  color: #444;
  text-indent: 0;
}
.part-divider .part-label {
  font-size: 11pt;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: #777;
  margin: 0 0 0.15in;
  text-indent: 0;
}
.part-divider h1 {
  font-size: 22pt;
  text-indent: 0;
}

.chapter-start {
  /* No "page: <name>" here on purpose (see the comment above the removed
     @page chapterstart rule) -- this break-before is now the ONLY thing
     that starts a chapter on a fresh page. Without a page-name mismatch
     to trigger an extra automatic break, the opening paragraph right
     after this element flows onto the SAME page as the title, exactly
     like a real printed book -- confirmed 2026-09-06 via a real local
     render (previously the title always got a page entirely to itself,
     with body text starting on the page after). */
  break-before: ${chapterBreak};
  padding-top: 1.6in;
  text-align: center;
}
.chapter-title {
  string-set: chaptertitle content(text);
  font-size: 19pt;
  font-weight: normal;
  letter-spacing: 0.04em;
  margin: 0;
  text-indent: 0;
}
`;
}

/** Builds the full print-ready HTML document Paged.js will paginate. */
export function buildPrintHtml(book: PrintBookInput, options: PrintOptions = {}): string {
  // Merge field-by-field with ?? rather than a blanket object spread --
  // callers (like the PDF export route, parsing optional query params)
  // may pass a key explicitly set to `undefined` rather than omitting it,
  // and {...DEFAULT, ...options} would let that undefined silently
  // clobber the default instead of falling back to it.
  const resolved: Required<PrintOptions> = {
    mirroredMargins: options.mirroredMargins ?? DEFAULT_PRINT_OPTIONS.mirroredMargins,
    indentParagraphs: options.indentParagraphs ?? DEFAULT_PRINT_OPTIONS.indentParagraphs,
    lineSpacing: options.lineSpacing ?? DEFAULT_PRINT_OPTIONS.lineSpacing,
    dropCaps: options.dropCaps ?? DEFAULT_PRINT_OPTIONS.dropCaps,
    chapterStartsOnRight: options.chapterStartsOnRight ?? DEFAULT_PRINT_OPTIONS.chapterStartsOnRight,
  };

  let chapterNumber = 1;
  const sectionsHtml = book.sections
    .map((section: EpubSection) => {
      if (section.kind === "part") {
        const result = partHtml(section.part, chapterNumber);
        chapterNumber = result.nextChapterNumber;
        return result.html;
      }
      const html = chapterHtml(section.chapter, chapterNumber);
      chapterNumber += 1;
      return html;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="${book.language || "en"}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(book.title)}</title>
<style>${buildCss(book.trimSize, resolved)}</style>
</head>
<body>
<section class="titlepage">
  <h1>${escapeXml(book.title)}</h1>
  <p class="byline">${escapeXml(book.author)}</p>
</section>
${sectionsHtml}
</body>
</html>`;
}
