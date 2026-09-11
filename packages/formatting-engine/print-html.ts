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
import { resolveSections, type ResolvedSection } from "./build-epub";
import { chapterHeadingLabel, PAGE_TYPE_IN_TOC } from "./page-types";
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
import { TRIM_SIZE_DIMENSIONS, type TrimSize } from "./trim-sizes";

// Same trim dimensions as TRIM_SIZE_DIMENSIONS above, but as plain numbers
// (inches) rather than CSS length strings -- needed so bleed math below can
// just add/subtract, rather than parsing a "6in" string back into a number.
// Derived directly from TRIM_SIZE_DIMENSIONS (not hand-duplicated) since
// trim-sizes.ts grew to 15 entries 2026-09-11 -- typing the same 15 numbers
// twice in two files would just be two chances to get one of them wrong.
const TRIM_SIZE_INCHES: Record<TrimSize, { width: number; height: number }> = Object.fromEntries(
  (Object.entries(TRIM_SIZE_DIMENSIONS) as [TrimSize, { width: string; height: string; label: string }][]).map(
    ([size, { width, height }]) => [size, { width: parseFloat(width), height: parseFloat(height) }]
  )
) as Record<TrimSize, { width: number; height: number }>;

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
  /** Insert a real Contents page right after the title page, listing
   * Chapters, Parts, Prologue & Epilogue only (same PAGE_TYPE_IN_TOC scope
   * as the EPUB export's Contents page -- see build-epub.ts's
   * contentsXhtml()) with each entry's page number and a real, if
   * visually invisible, clickable jump-link (same "looks like plain
   * text, works like a link on screen" convention as the hyperlinks
   * feature -- see the global "a" rule in buildCss). Author request,
   * 2026-09-11: "the option to just have on in the pdf" -- opt-in since a
   * print TOC is a front-matter convention some authors skip, unlike the
   * EPUB Contents page, which every reader gets automatically. */
  includeToc?: boolean;
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
  /** Text color on the page(s) the background image paints behind --
   * "dark" (default, the book's normal near-black body text) or "light"
   * (white). Has no effect when backgroundImageMode is "none" or no
   * background image was uploaded. Author request, 2026-09-08: rather
   * than this file automatically dimming/washing every background photo
   * to guarantee legibility (the 2026-09-08 fix's original approach --
   * see the removed wash-layer comment in git history), the author picks
   * the text color themselves to match whatever photo they uploaded, the
   * same way a real designer would choose "light text" for a dark cover
   * image and "dark text" for a light one, and gets the photo at its own
   * true strength either way -- no automatic dimming. */
  backgroundImageTextColor?: "dark" | "light";
  /** Show the chapter-start background image as a real TWO-PAGE SPREAD --
   * one continuous photo split across the page immediately before a
   * chapter opens (a blank verso/left-hand page, otherwise unused) and
   * the chapter's own opening (recto/right-hand) page, the way a real
   * illustrated book's chapter openers work -- rather than the photo
   * appearing only behind the single chapter-start page. Author request,
   * 2026-09-11: "the double spread is supposed to be an option for the
   * image behind the first page of the chapter" (clarifying that the
   * double-page-spread concept she wanted applies to THIS book-wide
   * background-image feature, not only to an inline manuscriptImage the
   * author places by hand -- see ManuscriptImageDisplayMode's own
   * separate "spread-double" mode, which she confirmed she ALSO still
   * wants kept as its own thing). Only meaningful when backgroundImageMode
   * is "chapter_start" (ignored for "none"/"every_page" -- there's no
   * single "chapter opening" moment for either of those to spread
   * across). Every chapter is forced onto a fresh two-page spread when
   * this is on, regardless of chapterStartsOnRight, since a facing-page
   * spread inherently requires the chapter to land on a recto page. */
  backgroundImageChapterStartSpread?: boolean;
  /** Bumps the book's body text up to a real large-print size (16pt,
   * roughly 40% bigger than the normal 11.5pt body -- see BODY_FONT_SIZE_PT/
   * LARGE_PRINT_BODY_FONT_SIZE_PT below), independent of trim size.
   * Author's reference (2026-09-07 backlog note) listed "Large print" as
   * its own group of trim sizes in the Format tab's dropdown, but on
   * inspection those were the SAME 4 physical page sizes already listed
   * under Popular/Full size (5.5x8.5, 6x9, 6.14x9.21, 7x10) -- confirmed
   * with Tasia (2026-09-11) that what she actually wants is a bigger body
   * font, usable with whatever trim size is already picked, not a
   * duplicate set of page-size entries that would do nothing different
   * from the same size picked elsewhere. So this is a flag orthogonal to
   * TrimSize, not a TrimSize value. Drop caps (relative "em" sizing) and
   * other body-relative elements scale automatically along with this;
   * running headers and page numbers (fixed pt sizes in the @page rule)
   * deliberately don't, since real large-print books still print normal-
   * sized running matter -- only the body reading text gets bigger. */
  largePrint?: boolean;
}

// Normal vs. large-print body text size -- see PrintOptions.largePrint
// above. 16pt is a real large-print-edition body size (most large-print
// publishers print body text in the 16-18pt range, vs. a normal book's
// 9-12pt); chosen at the lower end of that range so a large-print export
// doesn't balloon page count more than the format actually calls for.
const BODY_FONT_SIZE_PT = 11.5;
const LARGE_PRINT_BODY_FONT_SIZE_PT = 16;

const DEFAULT_PRINT_OPTIONS: Required<PrintOptions> = {
  mirroredMargins: false,
  indentParagraphs: true,
  lineSpacing: 1.5,
  includeToc: false,
  dropCaps: false,
  chapterStartsOnRight: false,
  showChapterTitles: true,
  backgroundImageMode: "none",
  backgroundImageTextColor: "dark",
  backgroundImageChapterStartSpread: false,
  largePrint: false,
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

function chapterHtml(
  chapter: EpubChapter,
  chapterNumber: number,
  id: string,
  ctx: RenderContext | undefined,
  showChapterTitles: boolean,
  backgroundSpreadDataUri: string | null
): string {
  const label = chapterHeadingLabel({
    pageType: chapter.pageType,
    title: chapter.title,
    numbered: chapter.numbered,
    chapterNumber,
  });
  // Per-chapter "Show Heading in Book" (chapter.showHeadingOverride)
  // overrides the book-wide showChapterTitles setting in EITHER
  // direction: null falls through to the book-wide value; true/false
  // forces this one chapter's heading on/off regardless of it.
  const showHeading = (chapter.showHeadingOverride ?? showChapterTitles) && !!label;
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

  // No <h1> at all (not just visually hidden) when the heading is off --
  // this also means nothing ever calls "string-set: chaptertitle" for
  // this chapter, so @top-center's "content: string(chaptertitle)"
  // correctly renders blank on its pages instead of carrying over a
  // stale title.
  const authorHtml =
    showHeading && chapter.chapterAuthor?.trim()
      ? `\n    <p class="chapter-author">by ${escapeXml(chapter.chapterAuthor.trim())}</p>`
      : "";
  const titleHtml = showHeading ? `\n    <h1 class="chapter-title">${escapeXml(label)}</h1>${authorHtml}` : "";
  const chapterStartClass = showHeading ? "chapter-start" : "chapter-start chapter-start--untitled";

  // Chapter-start background SPREAD (PrintOptions.backgroundImageChapterStartSpread,
  // 2026-09-11) -- an otherwise-blank verso page carrying the left half of
  // the spread photo, placed right before this chapter's own <section>,
  // plus a plain marker <img> as that section's very first child carrying
  // the right half (see buildCss's ".chapter-bg-spread-*" rules for the
  // actual split/bleed geometry -- this function only decides WHERE the
  // two halves land in the document's flow, since Paged.js paginates by
  // walking this same flow). Both are position: absolute in the final
  // CSS, so neither one visually displaces the real chapter-start
  // title/text that follows -- they only need to exist in the right
  // place in the DOM for Paged.js to slice them onto the right page.
  const spreadVersoHtml = backgroundSpreadDataUri
    ? `<div class="chapter-bg-spread-verso"><img class="chapter-bg-spread-verso-img" src="${escapeXml(backgroundSpreadDataUri)}" alt=""/></div>\n`
    : "";
  const spreadRightImgHtml = backgroundSpreadDataUri
    ? `\n  <img class="chapter-bg-spread-right-img" src="${escapeXml(backgroundSpreadDataUri)}" alt=""/>`
    : "";

  // "id" (from resolveSections(), shared with the EPUB build -- see that
  // function's comment) is this chapter's same-document anchor target for
  // the print Contents page's jump-links/page-number lookups (both use a
  // plain "#chapter-N" fragment against this id, resolved by Paged.js's
  // target-counter() and by the browser's own native in-page navigation).
  return `${spreadVersoHtml}<section class="chapter" id="${id}">${spreadRightImgHtml}
  <div class="${chapterStartClass}">${titleHtml}
  </div>
  ${markedScenesHtml}
</section>`;
}

// Just the part-divider page's own markup -- its chapters are now
// separate, sibling entries in resolveSections()'s flat output (walked
// directly by buildPrintHtml's main loop below, in the same reading
// order this function used to produce by nesting them inline), so this
// no longer needs to loop over part.chapters or track/return a
// next-chapter-number itself the way it did before 2026-09-11's Contents-
// page refactor -- resolveSections() is now the one place that does that
// counting, shared with the EPUB build.
function partDividerHtml(part: EpubPart, id: string): string {
  return `<section class="part-divider" id="${id}">
  <p class="part-label">Part</p>
  <h1>${escapeXml(part.title)}</h1>
</section>`;
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
  const {
    mirroredMargins,
    indentParagraphs,
    lineSpacing,
    dropCaps,
    chapterStartsOnRight,
    backgroundImageMode,
    backgroundImageTextColor,
    backgroundImageChapterStartSpread,
    largePrint,
  } = options;
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

  // Same bleed-escape math as spreadBleedCss above, but for a
  // "spread-double" image's two halves (see the ".manuscript-image-figure
  // --spread-double-left/-right" rules further down). Unlike a plain
  // "spread" image -- which can land on either a left or right page
  // depending on where it falls in the flow, hence spreadBleedCss keying
  // off Paged.js's own pagedjs_left_page/pagedjs_right_page classes --
  // these two classes are each DETERMINISTICALLY pinned to one page side
  // by their own break-before rule (left half always verso, right half
  // always the recto immediately after), so the same left/right margin
  // math can be written directly against the class name, no page-side
  // selector needed.
  //
  // HEIGHT is the true physical bled page height (${height}) directly,
  // NOT "calc(100% + ...)" the way spreadBleedCss's WIDTH math (still
  // used below) and the single-image --spread rule both do -- confirmed
  // by a real Paged.js render (2026-09-08) that percentage HEIGHT here
  // resolves to 0, not the page's content height: this figure's own
  // ancestor chain (the flowing chapter content) has no definite CSS
  // height anywhere above it, only WIDTH is definite that way in normal
  // block flow, and single-image --spread only gets away with height:
  // calc(100% + ...) because its <img> stays in normal (non-absolute)
  // flow, where a percentage-height replaced element with no definite
  // container instead falls back to its own intrinsic aspect ratio,
  // "accidentally" giving the flex figure something real to shrink-wrap
  // around. This figure's <img> is deliberately position: absolute (the
  // "sliding window" split -- see the class rules below), which takes it
  // OUT of flow entirely, so that fallback never fires and the figure's
  // indefinite percentage height collapses to a real, measured 0 instead
  // -- caught by pixel-sampling a real render showing both halves with
  // zero rendered height. Setting an outright absolute height sidesteps
  // the percentage-resolution question entirely, which is more robust
  // here regardless.
  const spreadDoubleBleedCss = `
.manuscript-image-figure--spread-double-left {
  margin: -${marginTopIn}in -${rightInside}in -${marginBottomIn}in -${rightOutside}in;
  width: calc(100% + ${rightOutside + rightInside}in);
  height: ${height};
}
.manuscript-image-figure--spread-double-right {
  margin: -${marginTopIn}in -${rightOutside}in -${marginBottomIn}in -${rightInside}in;
  width: calc(100% + ${rightOutside + rightInside}in);
  height: ${height};
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
   injected stylesheet's rule order.

   No automatic dimming/wash on the photo itself (an earlier 2026-09-08
   fix did this -- a near-opaque white layer -- after an author's dark,
   busy cover photo made real chapter text unreadable on top of it; she
   asked, reasonably, for a manual light/dark TEXT choice instead of
   always dimming her image, so the photo now always renders at its own
   true strength and backgroundImageTextColor below picks a legible text
   color to go with it instead). */
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
  backgroundImageDataUri && backgroundImageMode === "chapter_start" && !backgroundImageChapterStartSpread
    ? `/* Book-wide background image, behind only each chapter's OPENING
   page -- reuses the exact same real per-page marker render-pdf.ts
   already tags for hiding the running header on a chapter's first page
   (see the long comment above), rather than inventing a second
   mechanism for "the first page of this chapter." Verified 2026-09-07
   the same way as "every_page" above -- pixel-sampled a real paginated,
   multi-chapter render and confirmed the background shows on exactly the
   two .pagedjs_page_chapter_start pages and nowhere else. No automatic
   wash here either, for the same reason as "every_page" above.
   (Skipped entirely when backgroundImageChapterStartSpread is also on --
   that variant paints its own split image instead, see below.) */
.pagedjs_page_chapter_start {
  background-image: url(${backgroundImageDataUri}) !important;
  background-size: cover !important;
  background-position: center !important;
  background-repeat: no-repeat !important;
}
`
    : ""
}
${
  backgroundImageDataUri && backgroundImageMode === "chapter_start" && backgroundImageChapterStartSpread
    ? `/* Chapter-start background as a real TWO-PAGE SPREAD (author
   request, 2026-09-11: "the double spread is supposed to be an option
   for the image behind the first page of the chapter") -- ONE photo
   split across the otherwise-blank verso page right before a chapter
   opens and the chapter's own recto opening page, reading as one
   continuous image when the book is held open, exactly like a real
   illustrated book's chapter-opener spreads.

   chapterHtml() (see there) emits, for each chapter: a
   ".chapter-bg-spread-verso" wrapper div immediately BEFORE the
   chapter's <section>, forced onto a verso page via break-before below,
   and a plain marker <img class="chapter-bg-spread-right-img"> as that
   <section>'s very first child -- landing on the SAME page as the
   chapter's own .chapter-start once Paged.js paginates, confirmed via a
   real render (2026-09-11) that an absolutely-positioned, zero-flow-
   height element at the start of a multi-page section is sliced onto
   that section's FIRST page fragment, same as any other content there.
   Since the verso spacer forces its own page to verso and the chapter's
   .chapter-start still gets its own fresh-page break right after it
   (chapterBreak above, "page" or "recto" per chapterStartsOnRight --
   either way, the page immediately following a forced verso page is
   ALWAYS recto by binding math, so this works regardless of that
   separate setting), the two halves always land on the same physical
   spread. No extra "force recto" logic needed here for that reason.

   THE SPLIT ITSELF -- two different techniques for two different DOM
   shapes:
   - .chapter-bg-spread-verso is the ONLY content on its page (like
     .manuscript-image-figure--spread-double-left), so it can just BE
     the full bled page (bleed-escaped via negative margin, exactly like
     spreadDoubleBleedCss below) and hold a plain percentage-sized
     sliding-window <img> inside it (200% width / 100% height, left
     half showing at left:0) -- the same proven technique, just under a
     different class name since this is a separate feature.
   - .chapter-bg-spread-right-img can't do that -- it has to coexist on
     its page with the chapter's REAL title and body text, not replace
     them. It's position: absolute with z-index: -1 (paints behind
     normal in-flow content -- confirmed via a real render, including
     that the image stays fully visible rather than getting swallowed by
     some ancestor's own opaque background: Paged.js's own
     ".pagedjs_page_content" wrapper is the nearest position:relative
     ancestor around our own content, and it turns out to be exactly the
     page's MARGIN/CONTENT box, not the full physical page -- confirmed
     by direct measurement, not assumed -- so top/left are absolute inch
     offsets that escape back out to the true page edge (mirroring the
     negative-margin bleed escape used everywhere else in this file, just
     expressed as position offsets instead of margin since this element
     is out of flow) PLUS one extra full page-width added to "left" to
     slide the (double-page-wide) virtual canvas over by exactly one
     page, revealing its right half -- the same arithmetic as the
     percentage-based 200%/-100% trick above, just worked out in
     absolute inches since there's no already-page-sized ancestor to
     take percentages of here. Both halves resolve to the IDENTICAL
     pixel dimensions for their shared virtual canvas (confirmed by
     comparing the math, not just eyeballing it), so the crop lines up
     across the gutter same as the manuscriptImage version below. */
.chapter-bg-spread-verso {
  break-before: verso;
  break-after: page;
  margin: -${marginTopIn}in -${rightInside}in -${marginBottomIn}in -${rightOutside}in;
  width: calc(100% + ${rightOutside + rightInside}in);
  height: ${height};
  overflow: hidden;
  position: relative;
}
.chapter-bg-spread-verso-img {
  position: absolute;
  top: 0;
  left: 0;
  width: 200%;
  height: 100%;
  object-fit: cover;
}
.chapter-bg-spread-right-img {
  position: absolute;
  top: -${marginTopIn}in;
  left: -${(rightInside + widthIn).toFixed(4)}in;
  width: ${(widthIn * 2).toFixed(4)}in;
  height: ${height};
  object-fit: cover;
  z-index: -1;
}
`
    : ""
}
${
  backgroundImageDataUri && backgroundImageMode === "every_page" && backgroundImageTextColor === "light"
    ? `/* White text for a dark background photo (author request,
   2026-09-08, replacing the earlier automatic wash -- see the comment
   above). The universal descendant selector (rather than trying to
   individually re-color .chapter-title/.chapter-first-paragraph/figcaption/
   etc.) deliberately overrides EVERY text color on this page, including
   ones a more specific rule elsewhere in this file would otherwise win
   against a plain ".pagedjs_page { color: ... }" (e.g. .manuscript-image-
   figure--caption figcaption's own explicit color) -- this is also how
   the running header/page-number margin boxes get repainted white, since
   Paged.js renders those as real descendant DOM nodes of this same page
   box (confirmed by the pre-existing ".pagedjs_page_chapter_start
   .pagedjs_margin-top-center" visibility rule above, which relies on the
   exact same DOM relationship). */
.pagedjs_page, .pagedjs_page * {
  color: #fff !important;
}
`
    : ""
}
${
  backgroundImageDataUri && backgroundImageMode === "chapter_start" && backgroundImageTextColor === "light"
    ? `/* White text for a dark chapter-start background photo -- same
   mechanism and reasoning as "every_page" above, scoped to just the
   chapter-opening page box. */
.pagedjs_page_chapter_start, .pagedjs_page_chapter_start * {
  color: #fff !important;
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
  /* PrintOptions.largePrint (2026-09-11) -- see its doc comment above for
     why this is the only thing it changes: drop caps and other
     body-relative ("em") elements scale automatically along with this,
     running headers/page numbers (fixed pt sizes in the @page rule above)
     deliberately don't. */
  font-size: ${largePrint ? LARGE_PRINT_BODY_FONT_SIZE_PT : BODY_FONT_SIZE_PT}pt;
  line-height: ${lineSpacing};
  color: #1a1a1a;
}
/* A clickable link (see tiptap-to-xhtml.ts's "link" mark) still needs to
   be a real "a href" here for the underlying PDF link annotation to
   exist at all (Chromium's page.pdf() bakes real, clickable link
   annotations from real anchor tags -- confirmed via a real render, see
   engineering_notes.md) -- but a physical printed book has no use for
   blue/underlined "this is a link" styling, so it deliberately renders
   as completely normal body text. Author-confirmed (2026-09-11): works
   if the PDF is opened and clicked on a screen, invisible on paper. */
a {
  color: inherit;
  text-decoration: none;
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
   -- four display modes a writer picks per image:
     "header"        -- a modest, centered image (e.g. under a chapter
                         title). No forced break; sits wherever placed.
     "spread"        -- a full dedicated page. break-before/after: page is
                         the same mechanism .titlepage/.part-divider
                         already use above. Bleeds all the way to the true
                         physical page edge (past the trim line, into real
                         print bleed, when this book has any spread image
                         -- see BLEED_IN and spreadBleedCss above for the
                         mechanics and how this was verified against a
                         real render before shipping).
     "spread-double" -- (2026-09-08, author-requested) ONE photo split
                         across two FACING pages instead of filling one --
                         see the ".manuscript-image-figure--spread-double-
                         left/-right" rules and spreadDoubleBleedCss below
                         for the full mechanics.
     "caption"       -- the default: an inline photo, modestly sized, with
                         an optional <figcaption> underneath in small
                         italic type (classic photo-insert style).
   "align"/an explicit width (writer-controlled per image, see
   manuscript-image-view.tsx) are applied as inline styles directly on the
   <figure>/<img> by tiptap-to-xhtml.ts, which naturally override the
   class-based defaults below -- these rules are just each mode's default
   look when the writer hasn't overridden it (moot for "spread"/
   "spread-double", which never receive those inline styles in the first
   place -- see the "manuscriptImage" case in tiptap-to-xhtml.ts).
   object-fit: contain (not cover) on every mode so an odd aspect ratio
   never crops part of the writer's photo away without them asking for
   that (the exceptions are the spread and spread-double bleed rules
   below, which both deliberately use cover-style stretching to fill
   their bled page edge(s) to edge -- see the "manuscript-image" rules
   inside .manuscript-image-figure--spread and --spread-double-left/
   -right). */
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
  /* A "header" image is meant to be modest -- "a small image under the
     chapter title," not something that can eat the whole opening page.
     Capping only the WIDTH (max-width: 45%) wasn't enough: a portrait-
     oriented photo can still render very tall (height:auto scales with
     its own aspect ratio, not the page), and once it took up most of the
     chapter-start page's remaining height (that page also spends 1.6in
     on .chapter-start's own top padding before the title even starts),
     there wasn't enough room left for even orphans:2's worth of the
     first paragraph -- so Paged.js correctly refused to leave a single
     orphan line behind and pushed the WHOLE paragraph to the next page
     instead, leaving a big blank gap under the image. Author-reported
     2026-09-08 ("the image i intend to use as a header pushed my chapter
     text to the next page instead of directly under the image").
     Reproduced with a real local Paged.js render across a sweep of
     portrait aspect ratios (bug appeared right around 2.1:1 and up on a
     6x9 page) before this fix, and confirmed fixed the same way
     afterward -- image and first paragraph land on the same page across
     every aspect ratio tested, extreme ones included. 30% of the book's
     physical page height leaves comfortable room for the title above and
     several lines of text below on every trim size, while still letting
     a normal (non-extreme) portrait photo render close to its full 45%
     width. */
  max-height: ${(heightIn * 0.3).toFixed(2)}in;
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
/* "spread-double" -- one photo split across two facing pages (see the
   long mode comment above). Mechanics:
   1. tiptap-to-xhtml.ts emits TWO <figure class="...--spread-double-
      left/-right"> from the one manuscriptImage node, each with its own
      full copy of the SAME <img>.
   2. Left lands on a verso (left-hand) page and right on the recto
      immediately after it via break-before below -- "verso"/"recto" are
      the same CSS Fragmentation values already relied on for
      chapterStartsOnRight above, guaranteeing the pairing regardless of
      whether the left half happens to land on an even or odd page number
      in the document flow.
   3. Each figure bleeds to its own physical page edge exactly like a
      plain "spread" image does (spreadDoubleBleedCss above -- same
      negative-margin escape, just keyed directly off these two
      deterministic classes instead of Paged.js's page-side classes).
   4. The "sliding window": each figure's <img> is sized to 200% of the
      figure's own (already bled-to-full-page) width and 100% of its
      height -- i.e. a virtual canvas exactly as wide as BOTH bled pages
      side by side -- with object-fit: cover scaling/cropping the source
      photo to fill that virtual double-wide canvas, then shifted
      horizontally by -100% of the figure's width for the right half so
      only the image's right half shows (0 shift, i.e. its natural
      position, for the left half). Because both figures use IDENTICAL
      sizing math against the same source image, the two halves line up
      into one continuous image when the printed book is opened flat --
      the reader never sees the img itself "jump," only the physical page
      edge in the middle. Verify any future change here against a real
      Paged.js render (see this file's other bleed/pagination features
      for the verification standard) -- this is pure CSS geometry with no
      unit test to catch an off-by-one percentage. */
.manuscript-image-figure--spread-double-left,
.manuscript-image-figure--spread-double-right {
  break-after: page;
  margin: 0;
  /* Real height set below by spreadDoubleBleedCss (a plain "height: 100%"
     here doesn't resolve to anything useful -- see the long comment on
     spreadDoubleBleedCss above for why). */
  overflow: hidden;
  position: relative;
}
.manuscript-image-figure--spread-double-left {
  break-before: verso;
}
.manuscript-image-figure--spread-double-right {
  break-before: recto;
}
.manuscript-image-figure--spread-double-left .manuscript-image,
.manuscript-image-figure--spread-double-right .manuscript-image {
  position: absolute;
  top: 0;
  width: 200%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: cover;
}
.manuscript-image-figure--spread-double-left .manuscript-image {
  left: 0;
}
.manuscript-image-figure--spread-double-right .manuscript-image {
  left: -100%;
}
${spreadDoubleBleedCss}
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

/* Contents page (PrintOptions.includeToc, 2026-09-11) -- same "own fresh
   page, respects chapterStartsOnRight" placement rule as .part-divider
   above, immediately after the title page. Not given the "titlepage"
   named page (unlike .titlepage/.part-divider) -- it's meant to read as
   an ordinary front-matter page, with a normal running page number of
   its own at the bottom, not a special centered title-style page. */
.contents-page {
  break-before: ${chapterBreak};
  break-after: page;
  padding-top: 0.3in;
}
.contents-page h1 {
  font-size: 20pt;
  font-weight: normal;
  text-align: center;
  text-indent: 0;
  margin: 0 0 0.5in;
}
.toc-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.toc-part-chapters {
  list-style: none;
  margin: 0;
  padding: 0 0 0 0.35in;
}
/* Each row is its title/leader/page-number laid out as one line -- a
   real Vellum-style dotted leader between the title and its page number,
   not just two numbers side by side. */
.toc-row {
  display: flex;
  align-items: baseline;
  margin: 0.5em 0;
  text-indent: 0;
}
.toc-part-row {
  margin-top: 0.9em;
}
.toc-part-row .toc-title {
  font-weight: bold;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 0.92em;
}
.toc-title {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.toc-leader {
  flex: 1 1 auto;
  border-bottom: 1px dotted #999;
  margin: 0 0.4em 0.2em;
}
.toc-pagenum {
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
  color: #444;
}
/* The actual page-number lookup -- see printTocRowContent's comment in
   this file for why "data-toc-target" (not "href") is what carries the
   fragment id here, and confirmed against Paged.js's real
   target-counter() implementation before shipping, not just written from
   the CSS Generated Content spec's text (see the print TOC feature's
   verification notes in project memory). */
.toc-pagenum::after {
  content: target-counter(attr(data-toc-target), page);
}

.chapter-start {
  /* No "page: <name>" here on purpose (see the comment above the removed
     @page chapterstart rule) -- this break-before is now the ONLY thing
     that starts a chapter on a fresh page. Without a page-name mismatch
     to trigger an extra automatic break, the opening paragraph right
     after this element flows onto the SAME page as the title, exactly
     like a real printed book -- confirmed 2026-09-06 via a real local
     render (previously the title always got a page entirely to itself,
     with body text starting on the page after).

     EXCEPTION -- backgroundImageChapterStartSpread (2026-09-11): when
     that option is on, forcing break-before here is actively WRONG, not
     just redundant. CSS forced breaks (page/recto/verso) are unconditional
     -- they always insert a break, even from the very top of a fresh
     page/fragmentainer. Every chapter already gets its own guaranteed
     fresh recto page from the ".chapter-bg-spread-verso" spacer right
     before it (forced break-before:verso + break-after:page -- and a
     forced-verso page is always immediately followed by a recto page by
     binding math), with the recto's marker
     "<img class=chapter-bg-spread-right-img>" as literally the first
     thing in that page's content. Confirmed via a real render (2026-09-11)
     that leaving break-before:${chapterBreak} here ALSO fires, splitting
     the chapter onto a THIRD page -- the marker image lands on the
     guaranteed-recto page as intended, but the real .chapter-start title
     then force-breaks onto the page after THAT, decoupling the title from
     the image it's supposed to sit on top of. "avoid" (not simply
     omitting the property, whose initial value is "auto") reliably
     suppresses that extra forced break while still letting normal
     content-overflow pagination happen if this chapter's body text is
     long enough to need it -- the same trade every other break-avoiding
     rule in this file already makes. */
  break-before: ${backgroundImageChapterStartSpread ? "avoid" : chapterBreak};
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
/* "Add Chapter Author" -- a per-chapter byline for multi-author
   anthologies/collections, directly under the heading. */
.chapter-author {
  font-size: 11pt;
  font-style: italic;
  margin: 0.3em 0 0;
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

interface PrintTocGroup {
  partTitle: string | null; // null = chapters that aren't under any Part
  partId: string | null;
  chapters: { id: string; title: string }[];
}

// Print's own version of build-epub.ts's buildTocGroups() -- same
// PAGE_TYPE_IN_TOC scope and "group under the most recently seen Part"
// rule (so the two Contents pages can never disagree on WHICH chapters
// are TOC-worthy), but grouping same-document anchor ids instead of
// separate EPUB files, since print-html.ts is one flat document. Not
// merged into one shared function with buildTocGroups() -- the only
// difference is href-shape (an id vs. a filename), and resolveSections()
// above is already the one place that would matter if it drifted.
function buildPrintTocGroups(resolved: ResolvedSection[]): PrintTocGroup[] {
  const groups: PrintTocGroup[] = [];
  let current: PrintTocGroup = { partTitle: null, partId: null, chapters: [] };
  groups.push(current);

  for (const item of resolved) {
    if (item.kind === "part") {
      current = { partTitle: item.title, partId: item.id, chapters: [] };
      groups.push(current);
    } else if (PAGE_TYPE_IN_TOC[item.pageType!]) {
      current.chapters.push({ id: item.id, title: item.title });
    }
  }

  return groups.filter((g) => g.chapters.length > 0);
}

// One Contents-page row's INNER markup (not the <li> wrapper -- see
// printTocHtml below for why that's the caller's job): title on the
// left, a dotted leader, and the entry's real printed page number on the
// right, the standard print-book TOC layout. The row's own
// <a href="#..."> both makes the title text a real (if visually
// invisible, see the global "a" rule in buildCss) clickable jump-link AND
// is what target-counter() below reads its target page from.
//
// The page number is a SEPARATE element from the link (rather than
// content injected via the link's own ::after) carrying its own
// "data-toc-target" copy of the same href -- confirmed necessary via
// Paged.js's real target-counter() implementation (node_modules/pagedjs/
// src/modules/generated-content/target-counters.js): it resolves
// target-counter(attr(X), page) by reading attribute X off the exact
// element the CSS rule's selector matches, so the element showing the
// number needs that attribute directly on itself, not inherited from a
// sibling/ancestor.
function printTocRowContent(id: string, title: string): string {
  const href = `#${id}`;
  return `<a class="toc-title" href="${href}">${escapeXml(title)}</a>
        <span class="toc-leader"></span>
        <span class="toc-pagenum" data-toc-target="${href}"></span>`;
}

function printTocHtml(groups: PrintTocGroup[]): string {
  const body = groups
    .map((g) => {
      const items = g.chapters
        .map((c) => `      <li class="toc-row toc-chapter-row">
        ${printTocRowContent(c.id, c.title)}
      </li>`)
        .join("\n");
      if (g.partTitle === null) return items;
      // A part heading is its own top-level <li> (not nested inside
      // another <li> -- an <li> may contain a nested <ol>, but never
      // another <li> directly without one), immediately followed by a
      // sibling <li> that holds the nested <ol> of that part's chapters --
      // mirrors real, valid HTML list nesting rather than the shape
      // that's easiest to describe in prose.
      return `      <li class="toc-row toc-part-row">
        ${printTocRowContent(g.partId!, g.partTitle)}
      </li>
      <li class="toc-part-chapters-item">
        <ol class="toc-part-chapters">
${items}
        </ol>
      </li>`;
    })
    .join("\n");

  return `<section class="contents-page" id="contents">
  <h1>Contents</h1>
  <ol class="toc-list">
${body}
  </ol>
</section>`;
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
    includeToc: options.includeToc ?? DEFAULT_PRINT_OPTIONS.includeToc,
    dropCaps: options.dropCaps ?? DEFAULT_PRINT_OPTIONS.dropCaps,
    chapterStartsOnRight: options.chapterStartsOnRight ?? DEFAULT_PRINT_OPTIONS.chapterStartsOnRight,
    showChapterTitles: options.showChapterTitles ?? DEFAULT_PRINT_OPTIONS.showChapterTitles,
    backgroundImageMode: options.backgroundImageMode ?? DEFAULT_PRINT_OPTIONS.backgroundImageMode,
    backgroundImageTextColor: options.backgroundImageTextColor ?? DEFAULT_PRINT_OPTIONS.backgroundImageTextColor,
    backgroundImageChapterStartSpread:
      options.backgroundImageChapterStartSpread ?? DEFAULT_PRINT_OPTIONS.backgroundImageChapterStartSpread,
    largePrint: options.largePrint ?? DEFAULT_PRINT_OPTIONS.largePrint,
  };

  // Same embed-as-data-URI reasoning as the inline manuscriptImage ctx
  // below -- a single in-memory HTML string has nowhere else to point a
  // background-image url() at. null (no image uploaded, or its fetch
  // failed at export time) simply means the CSS rules in buildCss below
  // render nothing, same fail-soft behavior as every other image in this
  // pipeline. Computed before bleedActive (unlike before 2026-09-11)
  // since the chapter-start SPREAD variant now needs to know whether
  // there's really an image before deciding bleed applies.
  const backgroundImageDataUri = book.backgroundImage
    ? `data:${book.backgroundImage.mimeType};base64,${Buffer.from(book.backgroundImage.bytes).toString("base64")}`
    : null;

  // A chapter-start background SPREAD needs the same true-physical-edge
  // bleed as a manuscriptImage "spread"/"spread-double" -- it's just as
  // much a full-bleed photo, only driven by the book-wide background
  // image setting instead of an inline image the author placed by hand.
  const bleedActive =
    bookHasSpreadImage(book.sections) ||
    (resolved.backgroundImageMode === "chapter_start" &&
      resolved.backgroundImageChapterStartSpread &&
      !!backgroundImageDataUri);

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
    // This is the one pipeline with real facing left/right pages (see
    // RenderContext.supportsFacingPages) -- lets a "spread-double"
    // manuscriptImage node render as an actual two-page split instead of
    // tiptap-to-xhtml.ts's single-image fallback (what EPUB and the live
    // preview both get).
    supportsFacingPages: true,
  };

  // Only pass a real data URI through to chapterHtml/partHtml (and so
  // only emit the spread verso/marker-img HTML at all) when the spread
  // variant is actually selected AND there's really an image uploaded --
  // otherwise every chapter would grow a silently-unused blank verso page.
  const backgroundSpreadDataUri =
    resolved.backgroundImageMode === "chapter_start" && resolved.backgroundImageChapterStartSpread
      ? backgroundImageDataUri
      : null;

  // resolveSections() (shared with the EPUB build -- see its own comment
  // in build-epub.ts) does all the chapter/part numbering and heading-
  // label work in one flat, ordered pass; the loop below just turns each
  // resolved item into its HTML, in the same order partHtml's old nested
  // version used to produce by walking part.chapters inline.
  const resolvedSections = resolveSections(book.sections);
  const sectionsHtml = resolvedSections
    .map((item) =>
      item.kind === "part"
        ? partDividerHtml(item.part!, item.id)
        : chapterHtml(item.chapter!, item.chapterNumber, item.id, ctx, resolved.showChapterTitles, backgroundSpreadDataUri)
    )
    .join("\n");

  const tocGroups = resolved.includeToc ? buildPrintTocGroups(resolvedSections) : [];
  const tocHtml = tocGroups.length > 0 ? printTocHtml(tocGroups) : "";

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
${tocHtml}
${sectionsHtml}
</body>
</html>`;

  const { widthIn, heightIn } = resolvePageDimensions(book.trimSize, bleedActive);
  return { html, pageWidthIn: widthIn, pageHeightIn: heightIn };
}
