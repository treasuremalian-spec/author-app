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
//
// Real print bleed for full-spread images (added 2026-09-07, per author
// request) -- see the long comment right above BLEED_IN below for the
// mechanics and how this was verified against a real Paged.js render
// before shipping.

import { sceneContentToXhtml, isSceneContentEmpty, docHasSpreadImage, escapeXml, type RenderContext } from "./tiptap-to-xhtml";
import type { EpubBookInput, EpubChapter, EpubPart, EpubSection, EpubCoverImage } from "./build-epub";
import {
  CRIMSON_PRO_REGULAR,
  CRIMSON_PRO_ITALIC,
  CRIMSON_PRO_BOLD,
  CRIMSON_PRO_BOLD_ITALIC,
} from "./fonts-embedded";

// TrimSize/TRIM_SIZE_DIMENSIONS now live in trim-sizes.ts (re-exported
// here for every existing consumer of print-html.ts) -- split out so a
// CLIENT component (the Format tab's live preview) can import just those
// constants without pulling this file's own server-only imports (which
// flow into puppeteer-core) into a browser bundle. See trim-sizes.ts's
// file comment for the real local `next build` failure that motivated
// this.
export { TRIM_SIZE_DIMENSIONS, type TrimSize } from "./trim-sizes";
import type { TrimSize } from "./trim-sizes";

// Same trim dimensions as TRIM_SIZE_DIMENSIONS above, but as plain numbers
// (inches) rather than CSS length strings -- needed so bleed math below can
// just add/subtract, rather than parsing a "6in" string back into a number.
const TRIM_SIZE_INCHES: Record<TrimSize, { width: number; height: number }> = {
  "5x8": { width: 5, height: 8 },
  "6x9": { width: 6, height: 9 },
};

// How far a full-spread image bleeds past the book's actual trim line --
// 0.125in (1/8in) is the industry-standard bleed allowance most print-on-
// demand services (KDP, IngramSpark) ask for, and what a real Vellum-
// exported reference book with bleed images measures at.
//
// Real print bleed means the DELIVERED PDF page is physically LARGER than
// the book's trim size, with bleed-area artwork meant to be sliced off
// when the book block gets trimmed to its final size -- not just "the
// image touches the edge of whatever page we hand back," which is what
// the pre-2026-09-07 version of this file did (see the removed comment on
// .manuscript-image-figure--spread below; confirmed by inspecting a real
// export that the image stopped at the normal content margin, nowhere
// close to any page edge). So when this book has at least one "spread"
// image, EVERY page in the document (not just the ones with a spread
// image on them) gets rendered BLEED_IN larger on all four sides than its
// nominal trim size -- real print books use one uniform physical page
// size throughout, with normal (non-bleeding) pages simply carrying extra
// blank margin out to that same physical edge. A book with no spread
// images is entirely unaffected -- pages render at exactly the requested
// trim size, exactly as before this existed.
//
// The actual "make the image touch the true page edge" mechanism is a
// negative-margin escape on the .manuscript-image-figure--spread box,
// targeted per page side (Paged.js tags each generated page with either
// "pagedjs_left_page" or "pagedjs_right_page" -- confirmed by direct
// inspection of a real paginated DOM, since this isn't formally documented
// pagedjs API) since a mirrored-margins book has a different margin (and
// therefore a different escape distance) on its left vs. right pages. This
// whole approach (page-size math, margin math, and the negative-margin
// escape rule) was verified 2026-09-07 against a real local Paged.js +
// headless-Chromium render -- not just reasoned about -- by rendering a
// real spread image at a real trim size and pixel-sampling the resulting
// PDF's four corners and edge midpoints to confirm the image's fill color
// reaches every one of them, exactly matching the same "real rendered
// pixels, not text-run metadata" verification standard already used
// elsewhere in this pipeline (see the drop-cap vertical-alignment comment
// in this same file for prior art on why that distinction matters here).
const BLEED_IN = 0.125;

/** The book's actual PDF page dimensions in inches, given its trim size and
 * whether it needs bleed (see BLEED_IN above) -- shared by buildCss (which
 * needs it for the @page rule) and buildPrintHtml's return value (which
 * renderPrintPdf/render-pdf.ts needs to tell Chromium's page.pdf() the
 * real physical page size to print, now that it's not always simply the
 * nominal trim size -- see the "5x8/6x9 came out as Letter" history in
 * this file's own comments for why that value has to be exact). */
function resolvePageDimensions(trimSize: TrimSize, bleedActive: boolean): { widthIn: number; heightIn: number } {
  const { width, height } = TRIM_SIZE_INCHES[trimSize];
  const bleed = bleedActive ? BLEED_IN : 0;
  return { widthIn: width + 2 * bleed, heightIn: height + 2 * bleed };
}

export interface PrintBookInput extends EpubBookInput {
  trimSize: TrimSize;
  /** A book-wide background image for the "behind the text" print option
   * below -- pre-fetched by export-data.ts exactly like the cover image,
   * never used by the EPUB export. */
  backgroundImage?: EpubCoverImage | null;
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
  /** Show each chapter's title/name at its opening page. When false, a
   * chapter still starts on its own fresh page (the break-before structure
   * is unchanged) but with no visible heading text -- and, since there's
   * no title to show, the running header's chapter-title line goes blank
   * for that chapter too, rather than showing a name the author asked to
   * hide. Author request, 2026-09-07: "option to hide chapter/name". */
  showChapterTitles?: boolean;
  /** Places the book's background image (PrintBookInput.backgroundImage)
   * behind the text -- "none" (default, no effect even if an image is
   * set), "every_page" (behind every single page in the book), or
   * "chapter_start" (behind only each chapter's opening page). Has no
   * effect if no background image was uploaded. Author request,
   * 2026-09-07: "full page images to go behind the text of all the
   * pages.. or just the first page of each chapter" -- print-only, by
   * request; the EPUB export never reads PrintBookInput.backgroundImage
   * at all. */
  backgroundImageMode?: "none" | "every_page" | "chapter_start";
}

const DEFAULT_PRINT_OPTIONS: Required<PrintOptions> = {
  mirroredMargins: false,
  indentParagraphs: true,
  lineSpacing: 1.5,
  dropCaps: false,
  chapterStartsOnRight: false,
  showChapterTitles: true,
  backgroundImageMode: "none",
};

function sceneHtml(content: unknown, isFirstNonEmptyInChapter: boolean, ctx?: RenderContext): string {
  const divider = isFirstNonEmptyInChapter ? "" : `<p class="scene-break">⁂</p>\n`;
  return `${divider}${sceneContentToXhtml(content, ctx)}`;
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
  // Find the first ORDINARY body paragraph -- skip past any special-
  // purpose <p> a chapter might happen to open with: a manual scene
  // break's own <p class="scene-break"> (see the "sceneBreak" case in
  // tiptap-to-xhtml.ts) or a text-message bubble's <p class="text-
  // message ..."> (see the "textMessage" case there). Two reasons: (1)
  // drop caps and the text-indent reset only make sense for real prose --
  // wrapping an ornament glyph or a chat bubble's first character in a
  // giant drop-cap span looks broken; (2) this function ADDS its own
  // class="chapter-first-paragraph" attribute below, and simply
  // prepending it in front of an EXISTING class="..." attribute would
  // produce two "class=" attributes on one tag -- HTML's first-attribute-
  // wins rule for duplicates then silently drops the special paragraph's
  // own class, breaking its styling entirely. Confirmed 2026-09-06 via a
  // real local render: a manual scene break placed as a chapter's literal
  // first paragraph lost its ".scene-break" styling and had its "⁂"
  // ornament wrapped in a drop-cap span before this fix.
  //
  // A real ordinary paragraph never carries a class attribute (only an
  // optional inline style= for alignment -- see textAlignStyle above), so
  // "the first classless <p>" is a safe, generic rule that also protects
  // any future special paragraph type without needing another edit here.
  const openTagRe = /<p([^>]*)>/g;
  let match: RegExpExecArray | null;
  let openTagMatch: RegExpExecArray | null = null;
  while ((match = openTagRe.exec(html))) {
    if (!/(^|\s)class=/.test(match[1])) {
      openTagMatch = match;
      break;
    }
  }
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

function chapterHtml(chapter: EpubChapter, chapterNumber: number, ctx: RenderContext | undefined, showChapterTitles: boolean): string {
  const label = chapter.title?.trim() || `Chapter ${chapterNumber}`;
  let seenFirstScene = false;
  const scenesHtml = chapter.scenes
    .filter((scene) => !isSceneContentEmpty(scene.content))
    .map((scene) => {
      const html = sceneHtml(scene.content, !seenFirstScene, ctx);
      seenFirstScene = true;
      return html;
    })
    .join("\n");
  const markedScenesHtml = markChapterFirstParagraph(scenesHtml);

  // No <h1> at all (not just visually hidden) when titles are off -- this
  // also means nothing ever calls "string-set: chaptertitle" for this
  // chapter, so @top-center's "content: string(chaptertitle)" correctly
  // renders blank on its pages instead of carrying over a stale title.
  const titleHtml = showChapterTitles ? `\n    <h1 class="chapter-title">${escapeXml(label)}</h1>` : "";
  const chapterStartClass = showChapterTitles ? "chapter-start" : "chapter-start chapter-start--untitled";

  return `<section class="chapter">
  <div class="${chapterStartClass}">${titleHtml}
  </div>
  ${markedScenesHtml}
</section>`;
}

function partHtml(
  part: EpubPart,
  chapterNumberStart: number,
  ctx: RenderContext | undefined,
  showChapterTitles: boolean
): { html: string; nextChapterNumber: number } {
  let chapterNumber = chapterNumberStart;
  const chaptersHtml = part.chapters
    .map((chapter) => {
      const html = chapterHtml(chapter, chapterNumber, ctx, showChapterTitles);
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

/** True if any scene anywhere in the book contains a "spread"-mode
 * manuscriptImage node -- see BLEED_IN above for what this triggers. */
function bookHasSpreadImage(sections: EpubSection[]): boolean {
  for (const section of sections) {
    const chapters = section.kind === "part" ? section.part.chapters : [section.chapter];
    for (const chapter of chapters) {
      for (const scene of chapter.scenes) {
        if (docHasSpreadImage(scene.content)) return true;
      }
    }
  }
  return false;
}

function buildCss(
  trimSize: TrimSize,
  options: Required<PrintOptions>,
  bleedActive: boolean,
  backgroundImageDataUri: string | null
): string {
  const { widthIn, heightIn } = resolvePageDimensions(trimSize, bleedActive);
  const width = `${widthIn}in`;
  const height = `${heightIn}in`;
  const { mirroredMargins, indentParagraphs, lineSpacing, dropCaps, chapterStartsOnRight, backgroundImageMode } = options;
  const bleed = bleedActive ? BLEED_IN : 0;

  // Base margins (top/right/bottom/left), used as-is when mirroredMargins
  // is off. When it's on, left/right are instead driven by the :left/
  // :right page-side rules below, with a slightly bigger inside (spine)
  // margin than outside -- matching real print-book convention (and
  // roughly what a real Vellum-exported reference book measured at:
  // ~0.875in inside / ~0.62in outside, confirmed 2026-09-06). Each gets
  // BLEED_IN added on top when this book has a spread image (see BLEED_IN
  // above) -- the physical page grew by the same amount on every side, so
  // normal (non-bleeding) content needs that same extra margin to land in
  // exactly the same place *relative to the trim line* as it would on a
  // non-bled page; only the spread-image escape rule further down is
  // meant to actually reach the new, larger physical edge.
  const marginTopIn = 0.8 + bleed;
  const marginBottomIn = 0.9 + bleed;
  const marginOutsideIn = 0.6 + bleed;
  const marginInsideIn = 0.85 + bleed;
  const flatMarginIn = 0.65 + bleed;
  const marginTop = `${marginTopIn}in`;
  const marginBottom = `${marginBottomIn}in`;
  const marginOutside = `${marginOutsideIn}in`;
  const marginInside = `${marginInsideIn}in`;
  const baseMargin = mirroredMargins ? "" : `margin: ${marginTop} ${flatMarginIn}in ${marginBottom} ${flatMarginIn}in;`;
  const chapterBreak = chapterStartsOnRight ? "recto" : "page";

  // The full-spread-image bleed escape (see BLEED_IN above) -- a negative
  // margin equal to this page side's own margin box, sized back up with
  // calc() to fill the entire physical page (page size minus a negative
  // margin box always equals the full page, regardless of what the margin
  // box itself was). Written per Paged.js page-side class rather than a
  // single generic rule because a mirrored-margins book has a DIFFERENT
  // margin box on its left vs. right pages -- and even for a non-mirrored
  // book (where both sides use the same flat margin), Paged.js still tags
  // every page with one of these two classes, so writing both
  // unconditionally with the same numbers on each side is simplest and
  // correct either way, rather than branching this block on
  // mirroredMargins too.
  const rightOutside = mirroredMargins ? marginOutsideIn : flatMarginIn;
  const rightInside = mirroredMargins ? marginInsideIn : flatMarginIn;
  const spreadBleedCss = `
.pagedjs_right_page .manuscript-image-figure--spread {
  margin: -${marginTopIn}in -${rightOutside}in -${marginBottomIn}in -${rightInside}in;
  width: calc(100% + ${rightOutside + rightInside}in);
  height: calc(100% + ${marginTopIn + marginBottomIn}in);
}
.pagedjs_left_page .manuscript-image-figure--spread {
  margin: -${marginTopIn}in -${rightInside}in -${marginBottomIn}in -${rightOutside}in;
  width: calc(100% + ${rightOutside + rightInside}in);
  height: calc(100% + ${marginTopIn + marginBottomIn}in);
}
`;

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
${
  backgroundImageDataUri && backgroundImageMode === "every_page"
    ? `/* Book-wide background image, behind every page's text (author
   request, 2026-09-07). ".pagedjs_page" is Paged.js's own per-page box,
   sized to the full physical page -- painting a background on it directly
   naturally sits behind the page's actual content, which paints as
   normal foreground boxes on top, no z-index needed. Verified 2026-09-07
   against a real local Paged.js + headless-Chromium render (not just
   reasoned about): both this "every_page" mode and "chapter_start" below
   were pixel-sampled (a screenshot of each rendered .pagedjs_page box,
   decoded back to RGB) as well as computed-style-checked, confirming the
   background actually paints on every intended page and nowhere else.
   The !important below turned out NOT to be load-bearing in the pinned
   pagedjs version -- a side-by-side run with !important stripped from
   just these four declarations still won -- but it's kept anyway as
   cheap insurance against a future pagedjs upgrade changing its own
   injected stylesheet's rule order. */
.pagedjs_page {
  background-image: url(${backgroundImageDataUri}) !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}
`
    : ""
}
${
  backgroundImageDataUri && backgroundImageMode === "chapter_start"
    ? `/* Book-wide background image, behind only each chapter's OPENING
   page -- reuses the exact same real per-page marker render-pdf.ts
   already tags for hiding the running header on a chapter's first page
   (see the long comment above), rather than inventing a second
   mechanism for "the first page of this chapter." Verified 2026-09-07
   the same way as "every_page" above -- pixel-sampled a real paginated,
   multi-chapter render and confirmed the background shows on exactly the
   two .pagedjs_page_chapter_start pages and nowhere else. */
.pagedjs_page_chapter_start {
  background-image: url(${backgroundImageDataUri}) !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}
`
    : ""
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
/* A "text conversation" bubble (see tiptap-to-xhtml.ts's "textMessage"
   case and apps/web/components/manuscript/extensions/text-message.ts).
   "display: table" sizes the box to its own content (capped by
   max-width) rather than stretching full-width like a normal <p> --
   the ".text-message--right"/"--center" modifier classes then move that
   box with margin, since text-align only aligns content INSIDE a box,
   not the box itself. Left is the unmodified default (margin: ... 0 0,
   i.e. flush left already). A sans-serif face distinct from the serif
   body text reads as "this is a phone screen", matching the convention
   real printed books use for texting scenes. */
.text-message {
  display: table;
  max-width: 72%;
  margin: 0.5em 0;
  padding: 0.55em 0.9em;
  border-radius: 1.1em;
  background: #ece6f0;
  color: #1a1a1a;
  font-family: Helvetica, Arial, sans-serif;
  font-size: 0.92em;
  line-height: 1.35;
  text-align: left;
  text-indent: 0;
  hyphens: none;
}
.text-message--right {
  margin-left: auto;
  margin-right: 0;
}
.text-message--center {
  margin-left: auto;
  margin-right: auto;
}
/* Inline manuscript images (see tiptap-to-xhtml.ts's "manuscriptImage"
   case and apps/web/components/manuscript/extensions/manuscript-image.ts)
   -- three display modes a writer picks per image:
     "header"  -- a modest, centered image (e.g. under a chapter title).
                  No forced break; it sits wherever the writer placed it.
     "spread"  -- a full dedicated page. break-before/after: page is the
                  same mechanism .titlepage/.part-divider already use
                  above. Bleeds all the way to the true physical page edge
                  (past the trim line, into real print bleed, when this
                  book has any spread image -- see BLEED_IN and
                  spreadBleedCss above for the mechanics and how this was
                  verified against a real render before shipping).
     "caption" -- the default: an inline photo, modestly sized, with an
                  optional <figcaption> underneath in small italic type
                  (classic photo-insert style).
   "align"/an explicit width (writer-controlled per image, see
   manuscript-image-view.tsx) are applied as inline styles directly on the
   <figure>/<img> by tiptap-to-xhtml.ts, which naturally override the
   class-based defaults below -- these rules are just each mode's default
   look when the writer hasn't overridden it.
   object-fit: contain (not cover) on every mode so an odd aspect ratio
   never crops part of the writer's photo away without them asking for
   that (the one exception is the spread bleed rule above, which
   deliberately uses cover-style stretching to fill the bled page edge to
   edge -- see the "manuscript-image" rule inside .manuscript-image-figure
   --spread below). */
.manuscript-image-figure {
  margin: 1em 0;
  text-align: center;
}
.manuscript-image-figure .manuscript-image {
  max-width: 100%;
  height: auto;
  object-fit: contain;
}
.manuscript-image-figure--header .manuscript-image {
  max-width: 45%;
}
.manuscript-image-figure--spread {
  break-before: page;
  break-after: page;
  margin: 0;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.manuscript-image-figure--spread .manuscript-image {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: cover;
}
${spreadBleedCss}
.manuscript-image-figure--caption .manuscript-image {
  max-width: 62%;
}
.manuscript-image-figure--caption figcaption {
  margin-top: 0.5em;
  font-family: "CrimsonPro", Georgia, "Times New Roman", serif;
  font-style: italic;
  font-size: 0.85em;
  color: #555;
  text-indent: 0;
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
/* Titles hidden (see PrintOptions.showChapterTitles): the chapter still
   gets its own fresh page (break-before is set on .chapter-start itself,
   unaffected by this), just with a smaller, plain gap up top instead of
   the full title-sized one -- an empty 1.6in block with nothing in it
   would read as a rendering bug, not a deliberate blank heading. */
.chapter-start--untitled {
  padding-top: 0.9in;
}
`;
}

export interface PrintDocument {
  html: string;
  /** The real physical PDF page size renderPrintPdf/render-pdf.ts must
   * pass to Chromium's page.pdf() -- not always exactly the requested
   * trim size, see BLEED_IN above. */
  pageWidthIn: number;
  pageHeightIn: number;
}

/** Builds the full print-ready HTML document Paged.js will paginate. */
export function buildPrintHtml(book: PrintBookInput, options: PrintOptions = {}): PrintDocument {
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
    showChapterTitles: options.showChapterTitles ?? DEFAULT_PRINT_OPTIONS.showChapterTitles,
    backgroundImageMode: options.backgroundImageMode ?? DEFAULT_PRINT_OPTIONS.backgroundImageMode,
  };

  const bleedActive = bookHasSpreadImage(book.sections);

  // Same embed-as-data-URI reasoning as the inline manuscriptImage ctx
  // below -- a single in-memory HTML string has nowhere else to point a
  // background-image url() at. null (no image uploaded, or its fetch
  // failed at export time) simply means the CSS rules in buildCss below
  // render nothing, same fail-soft behavior as every other image in this
  // pipeline.
  const backgroundImageDataUri = book.backgroundImage
    ? `data:${book.backgroundImage.mimeType};base64,${Buffer.from(book.backgroundImage.bytes).toString("base64")}`
    : null;

  // Images are embedded as data: URIs -- a single in-memory HTML string
  // (which is all Paged.js/Puppeteer render from, see render-pdf.ts) has
  // nowhere else to point an <img src> at. book.images is pre-fetched by
  // export-data.ts before buildPrintHtml is ever called, so this stays a
  // synchronous lookup, not a network call. A miss (an image whose bytes
  // couldn't be fetched at export time) fails soft -- see the
  // "manuscriptImage" case in tiptap-to-xhtml.ts.
  const ctx: RenderContext = {
    resolveImage: (src) => {
      const asset = book.images?.[src];
      if (!asset) return null;
      return `data:${asset.mimeType};base64,${Buffer.from(asset.bytes).toString("base64")}`;
    },
  };

  let chapterNumber = 1;
  const sectionsHtml = book.sections
    .map((section: EpubSection) => {
      if (section.kind === "part") {
        const result = partHtml(section.part, chapterNumber, ctx, resolved.showChapterTitles);
        chapterNumber = result.nextChapterNumber;
        return result.html;
      }
      const html = chapterHtml(section.chapter, chapterNumber, ctx, resolved.showChapterTitles);
      chapterNumber += 1;
      return html;
    })
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="${book.language || "en"}">
<head>
<meta charset="utf-8"/>
<title>${escapeXml(book.title)}</title>
<style>${buildCss(book.trimSize, resolved, bleedActive, backgroundImageDataUri)}</style>
</head>
<body>
<section class="titlepage">
  <h1>${escapeXml(book.title)}</h1>
  <p class="byline">${escapeXml(book.author)}</p>
</section>
${sectionsHtml}
</body>
</html>`;

  const { widthIn, heightIn } = resolvePageDimensions(book.trimSize, bleedActive);
  return { html, pageWidthIn: widthIn, pageHeightIn: heightIn };
}
