// Assembles a real, valid EPUB3 file (a zip with a specific required
// structure) from a book's title/author plus its Part -> Chapter -> Scene
// tree. Deliberately hand-built with JSZip (pure JS, no native bindings)
// rather than a heavier EPUB library -- keeps this reliable in a serverless
// environment and easy to reason about.

import JSZip from "jszip";
import { sceneContentToXhtml, isSceneContentEmpty, escapeXml, type RenderContext } from "./tiptap-to-xhtml";
import { chapterHeadingLabel, PAGE_TYPE_IN_TOC, PAGE_TYPE_LABELS, type PageType } from "./page-types";

export interface EpubScene {
  id: string;
  content: unknown; // Tiptap/ProseMirror document JSON
}

export interface EpubChapter {
  id: string;
  title: string;
  // "Convert To" page type + related per-chapter options (2026-09-11,
  // Phase 16) -- see page-types.ts's chapterHeadingLabel() for exactly
  // how these combine into the heading that actually prints.
  pageType: PageType;
  numbered: boolean;
  chapterAuthor: string | null;
  // null = always show (EPUB has no book-wide "show chapter titles"
  // setting to inherit from, unlike the print PDF); true/false force
  // this one chapter's heading on/off.
  showHeadingOverride: boolean | null;
  scenes: EpubScene[];
}

export interface EpubPart {
  id: string;
  title: string;
  chapters: EpubChapter[];
}

export type EpubSection =
  | { kind: "part"; part: EpubPart }
  | { kind: "chapter"; chapter: EpubChapter };

export interface EpubCoverImage {
  bytes: Uint8Array;
  mimeType: string;
  /** File extension without the dot, e.g. "jpg". */
  extension: string;
}

export interface EpubBookInput {
  title: string;
  author: string;
  /** BCP 47 language tag, e.g. "en". Defaults to "en". */
  language?: string;
  /** A unique, stable string identifying this book -- does not need to be a real UUID. */
  identifier: string;
  /** Top-level Part/Chapter nodes, in reading order. */
  sections: EpubSection[];
  /** The book's cover image, if one has been uploaded. Shown as the EPUB's actual cover on a real e-reader. */
  cover?: EpubCoverImage | null;
  /** Every inline manuscript image referenced anywhere in this book's scene
   * content (see the "manuscriptImage" node/case), keyed by the URL stored
   * in each image node's "src" attribute -- the same Supabase Storage
   * public URL the editor uploaded it to. Pre-fetched once, up front, and
   * deduped by the caller (apps/web/lib/export-data.ts) so buildEpub/
   * buildPrintHtml never need to make a network call themselves. */
  images?: Record<string, EpubCoverImage>;
}

interface ManifestEntry {
  id: string;
  filename: string;
  mediaType: string;
  properties?: string;
}

interface NavEntry {
  filename: string;
  title: string;
  isPart: boolean;
}

// A part/chapter, numbered and filed ahead of time -- lets the Contents
// page (which must be written into the spine BEFORE any chapter content)
// know every chapter's real filename and heading without a fragile
// "guess what addChapter will generate" scheme. See resolveSections().
interface ResolvedSection {
  kind: "part" | "chapter";
  id: string;
  filename: string;
  title: string;
  chapterNumber: number; // 0 for a part
  pageType?: PageType; // chapter only
  chapter?: EpubChapter;
  part?: EpubPart;
}

interface TocGroup {
  partTitle: string | null; // null = chapters that aren't under any Part
  partHref: string | null;
  chapters: { href: string; title: string }[];
}

const XHTML_HEAD = (title: string) => `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>`;

function xhtmlPage(title: string, bodyHtml: string, bodyClass?: string): string {
  return `${XHTML_HEAD(title)}
<body${bodyClass ? ` class="${bodyClass}"` : ""}>
${bodyHtml}
</body>
</html>`;
}

function titlePageHtml(book: EpubBookInput): string {
  return xhtmlPage(
    book.title,
    `  <section epub:type="titlepage" class="titlepage">
    <h1>${escapeXml(book.title)}</h1>
    <p class="by">${escapeXml(book.author)}</p>
  </section>`,
    "titlepage"
  );
}

function coverPageHtml(book: EpubBookInput, coverFilename: string): string {
  return xhtmlPage(
    book.title,
    `  <section epub:type="cover" class="cover-page">
    <img src="${coverFilename}" alt="${escapeXml(book.title)} cover"/>
  </section>`,
    "cover-page"
  );
}

function partPageHtml(part: EpubPart): string {
  return xhtmlPage(
    part.title,
    `  <section epub:type="part" class="part-divider">
    <h1>${escapeXml(part.title)}</h1>
  </section>`,
    "part-divider"
  );
}

// EPUB3 has a standard vocabulary for exactly this kind of front-/back-
// matter section (https://www.w3.org/publishing/epub3/epub-ssv.html) --
// mapped here for every page type that has a clean standard term; the
// rest (no exact standard equivalent) just fall back to the plain
// "chapter" epub:type, same as before this feature existed.
const EPUB_TYPE_BY_PAGE_TYPE: Partial<Record<PageType, string>> = {
  COPYRIGHT: "copyright-page",
  DEDICATION: "dedication",
  EPIGRAPH: "epigraph",
  FOREWORD: "foreword",
  INTRODUCTION: "introduction",
  PREFACE: "preface",
  PROLOGUE: "prologue",
  EPILOGUE: "epilogue",
  AFTERWORD: "afterword",
  BIBLIOGRAPHY: "bibliography",
  ACKNOWLEDGMENTS: "acknowledgments",
};

// The ONE place that assigns every part/chapter its filename and chapter
// number, in reading order -- used both to build the Contents page (which
// must exist in the spine before any chapter content is written) and by
// the real build loop below, so the two can never disagree on what a
// chapter is called or numbered. Chapter filenames are a dedicated
// sequential counter (not tied to manifest.length, which also grows from
// unrelated inline images) specifically so they're fully predictable
// ahead of the real write loop.
function resolveSections(sections: EpubSection[]): ResolvedSection[] {
  const resolved: ResolvedSection[] = [];
  let partNumber = 0;
  let chapterNumber = 0;
  let chapterFileIndex = 0;

  function resolveChapter(chapter: EpubChapter): ResolvedSection {
    if (chapter.pageType === "CHAPTER") chapterNumber += 1;
    chapterFileIndex += 1;
    const id = `chapter-${chapterFileIndex}`;
    const label = chapterHeadingLabel({
      pageType: chapter.pageType,
      title: chapter.title,
      numbered: chapter.numbered,
      chapterNumber,
    });
    return {
      kind: "chapter",
      id,
      filename: `${id}.xhtml`,
      title: label || chapter.title || PAGE_TYPE_LABELS[chapter.pageType],
      chapterNumber,
      pageType: chapter.pageType,
      chapter,
    };
  }

  for (const section of sections) {
    if (section.kind === "part") {
      partNumber += 1;
      const id = `part-${partNumber}`;
      resolved.push({
        kind: "part",
        id,
        filename: `${id}.xhtml`,
        title: section.part.title,
        chapterNumber: 0,
        part: section.part,
      });
      for (const chapter of section.part.chapters) {
        resolved.push(resolveChapter(chapter));
      }
    } else {
      resolved.push(resolveChapter(section.chapter));
    }
  }

  return resolved;
}

// Groups the TOC-eligible chapters (PAGE_TYPE_IN_TOC) under whichever
// Part most recently preceded them -- chapters before the book's first
// Part (or in a book with no Parts at all) land in one partTitle:null
// group. A group with zero chapters (a Part with no in-TOC children, or
// no chapters before the first Part) is dropped rather than shown as an
// empty heading.
function buildTocGroups(resolved: ResolvedSection[]): TocGroup[] {
  const groups: TocGroup[] = [];
  let current: TocGroup = { partTitle: null, partHref: null, chapters: [] };
  groups.push(current);

  for (const item of resolved) {
    if (item.kind === "part") {
      current = { partTitle: item.title, partHref: item.filename, chapters: [] };
      groups.push(current);
    } else if (PAGE_TYPE_IN_TOC[item.pageType!]) {
      current.chapters.push({ href: item.filename, title: item.title });
    }
  }

  return groups.filter((g) => g.chapters.length > 0);
}

function contentsXhtml(book: EpubBookInput, groups: TocGroup[]): string {
  const body = groups
    .map((g) => {
      const items = g.chapters
        .map((c) => `        <li><a href="${c.href}">${escapeXml(c.title)}</a></li>`)
        .join("\n");
      if (g.partTitle === null) return items;
      return `      <li class="toc-part">
        <a href="${g.partHref}">${escapeXml(g.partTitle)}</a>
        <ol>
${items}
        </ol>
      </li>`;
    })
    .join("\n");

  return xhtmlPage(
    `${book.title} -- Contents`,
    `  <section class="contents-page">
    <h1>Contents</h1>
    <ol>
${body}
    </ol>
  </section>`,
    "contents-page"
  );
}

function chapterPageHtml(chapter: EpubChapter, chapterNumber: number, ctx?: RenderContext): string {
  const nonEmptyScenes = chapter.scenes.filter((s) => !isSceneContentEmpty(s.content));
  const body = nonEmptyScenes
    .map((scene, i) => {
      const html = sceneContentToXhtml(scene.content, ctx);
      const divider = i > 0 ? `  <p class="scene-break">&#8258;</p>\n` : "";
      return `${divider}${html}`;
    })
    .join("\n");

  const label = chapterHeadingLabel({
    pageType: chapter.pageType,
    title: chapter.title,
    numbered: chapter.numbered,
    chapterNumber,
  });
  const showHeading = (chapter.showHeadingOverride ?? true) && !!label;
  const authorHtml =
    showHeading && chapter.chapterAuthor?.trim()
      ? `\n    <p class="chapter-author">by ${escapeXml(chapter.chapterAuthor.trim())}</p>`
      : "";
  const headingHtml = showHeading ? `\n    <h1>${escapeXml(label)}</h1>${authorHtml}` : "";
  const epubType = EPUB_TYPE_BY_PAGE_TYPE[chapter.pageType] ?? "chapter";

  return xhtmlPage(
    label || chapter.title || "Chapter",
    `  <section epub:type="${epubType}">${headingHtml}
${body || "  <p>&#160;</p>"}
  </section>`
  );
}

const STYLES_CSS = `@charset "UTF-8";
html, body {
  margin: 0;
  padding: 0;
}
body {
  font-family: Georgia, "Palatino Linotype", "Book Antiqua", serif;
  font-size: 1em;
  line-height: 1.5;
  text-align: justify;
  margin: 0 5%;
}
h1 {
  font-family: Georgia, serif;
  font-weight: normal;
  font-size: 1.6em;
  text-align: center;
  margin: 2.5em 0 1.5em;
}
p {
  margin: 0;
  text-indent: 1.5em;
  orphans: 2;
  widows: 2;
}
p + p {
  margin-top: 0;
}
h1 + p,
.scene-break + p {
  text-indent: 0;
}
/* A clickable link (see tiptap-to-xhtml.ts's "link" mark) -- explicit
   styling rather than relying on each e-reader's own default "a" look,
   which varies. Print's own stylesheet (print-html.ts) deliberately does
   NOT style links this way -- see the comment there. */
a {
  color: #2952a3;
  text-decoration: underline;
}
.scene-break {
  text-align: center;
  text-indent: 0;
  margin: 1.5em 0;
  letter-spacing: 0.5em;
}
/* A writer-inserted manual page break (see tiptap-to-xhtml.ts's
   "pageBreak" case). page-break-after is the older, most widely-supported
   property across e-readers; break-after is the modern equivalent -- both
   are included so a reader honors whichever it implements. */
.manual-page-break {
  page-break-after: always;
  break-after: page;
}
/* A "text conversation" bubble (see tiptap-to-xhtml.ts's "textMessage"
   case) -- same "display: table" + margin positioning trick used in
   print-html.ts, chosen over "display: inline-block" (whose own box
   can't be moved by its own text-align) and picked deliberately for wide
   e-reader compatibility over newer alternatives like "width: fit-content".
   Left is the unmodified default (flush left already). */
.text-message {
  display: table;
  max-width: 75%;
  margin: 0.6em 0;
  padding: 0.55em 0.9em;
  border-radius: 1.1em;
  background: #ece6f0;
  font-family: Helvetica, Arial, sans-serif;
  font-size: 0.95em;
  line-height: 1.4;
  text-align: left;
  text-indent: 0;
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
   case) -- same three display modes as the print CSS (print-html.ts
   carries the fuller explanation of each). "spread" uses page-break-
   before/after (not break-before/after alone) for the same older/wider
   e-reader compatibility reasoning as .manual-page-break above -- EPUB is
   reflowable, so "a full dedicated page" here means "surrounded by forced
   breaks", not a fixed physical page the way print's is. */
.manuscript-image-figure {
  margin: 1em 0;
  text-align: center;
}
.manuscript-image-figure .manuscript-image {
  max-width: 100%;
  height: auto;
}
.manuscript-image-figure--header .manuscript-image {
  max-width: 50%;
}
.manuscript-image-figure--spread {
  page-break-before: always;
  break-before: page;
  page-break-after: always;
  break-after: page;
}
.manuscript-image-figure--spread .manuscript-image {
  max-width: 100%;
}
.manuscript-image-figure--caption .manuscript-image {
  max-width: 70%;
}
.manuscript-image-figure--caption figcaption {
  margin-top: 0.5em;
  font-style: italic;
  font-size: 0.85em;
  color: #555;
  text-indent: 0;
}
.cover-page {
  margin: 0;
  padding: 0;
  text-align: center;
}
.cover-page img {
  width: 100%;
  height: auto;
  display: block;
}
.titlepage {
  text-align: center;
  margin-top: 35%;
}
.titlepage h1 {
  font-size: 2em;
  margin-bottom: 0.5em;
}
.titlepage .by {
  text-indent: 0;
  font-style: italic;
  font-size: 1.1em;
}
.part-divider {
  text-align: center;
  margin-top: 40%;
}
.part-divider h1 {
  font-size: 1.4em;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
/* The new in-book "Contents" page (2026-09-11, author request) -- a real,
   visible page right after the title page, distinct from the e-reader's
   own built-in Contents/TOC menu (nav.xhtml, unaffected by any of this). */
.contents-page h1 {
  margin-bottom: 1em;
}
.contents-page ol {
  list-style: none;
  margin: 0;
  padding: 0;
}
.contents-page ol ol {
  margin-top: 0.4em;
  padding-left: 1.5em;
}
.contents-page > section > ol > li {
  margin: 0.7em 0;
  text-align: center;
}
.toc-part > a {
  font-weight: bold;
  text-decoration: none;
  color: inherit;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-size: 0.9em;
}
.toc-part ol li {
  margin: 0.5em 0;
  font-weight: normal;
  text-transform: none;
  letter-spacing: normal;
  font-size: 1em;
}
blockquote {
  margin: 1em 2em;
  font-style: italic;
}
ul, ol {
  margin: 1em 0 1em 1.5em;
}
`;

function containerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

function contentOpf(
  book: EpubBookInput,
  manifest: ManifestEntry[],
  spineIds: string[],
  modified: string,
  coverManifestId: string | null
): string {
  const manifestXml = manifest
    .map(
      (m) =>
        `    <item id="${m.id}" href="${m.filename}" media-type="${m.mediaType}"${
          m.properties ? ` properties="${m.properties}"` : ""
        }/>`
    )
    .join("\n");
  const spineXml = spineIds.map((id) => `    <itemref idref="${id}"/>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id" xml:lang="${book.language ?? "en"}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXml(book.identifier)}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(book.author)}</dc:creator>
    <dc:language>${book.language ?? "en"}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>${coverManifestId ? `
    <meta name="cover" content="${coverManifestId}"/>` : ""}
  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine>
${spineXml}
  </spine>
</package>`;
}

function navXhtml(book: EpubBookInput, entries: NavEntry[]): string {
  const items = entries
    .filter((e) => !e.isPart)
    .map((e) => `      <li><a href="${e.filename}">${escapeXml(e.title)}</a></li>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>${escapeXml(book.title)} -- Contents</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Contents</h1>
    <ol>
${items}
    </ol>
  </nav>
</body>
</html>`;
}

function tocNcx(book: EpubBookInput, entries: NavEntry[]): string {
  const navPoints = entries
    .filter((e) => !e.isPart)
    .map(
      (e, i) => `    <navPoint id="navpoint-${i + 1}" playOrder="${i + 1}">
      <navLabel><text>${escapeXml(e.title)}</text></navLabel>
      <content src="${e.filename}"/>
    </navPoint>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${escapeXml(book.identifier)}"/>
  </head>
  <docTitle><text>${escapeXml(book.title)}</text></docTitle>
  <navMap>
${navPoints}
  </navMap>
</ncx>`;
}

/** Build a complete EPUB file and return it as a Buffer, ready to send as a download. */
export async function buildEpub(book: EpubBookInput): Promise<Buffer> {
  const zip = new JSZip();

  // mimetype MUST be the first entry and MUST be stored uncompressed.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });

  zip.file("META-INF/container.xml", containerXml());

  const oebps = zip.folder("OEBPS")!;
  oebps.file("styles.css", STYLES_CSS);
  oebps.file("title.xhtml", titlePageHtml(book));

  const manifest: ManifestEntry[] = [
    { id: "nav", filename: "nav.xhtml", mediaType: "application/xhtml+xml", properties: "nav" },
    { id: "ncx", filename: "toc.ncx", mediaType: "application/x-dtbncx+xml" },
    { id: "css", filename: "styles.css", mediaType: "text/css" },
    { id: "title", filename: "title.xhtml", mediaType: "application/xhtml+xml" },
  ];
  const spineIds: string[] = [];
  const navEntries: NavEntry[] = [];

  let coverManifestId: string | null = null;
  if (book.cover) {
    const coverImageFilename = `cover.${book.cover.extension}`;
    coverManifestId = "cover-image";
    oebps.file(coverImageFilename, book.cover.bytes);
    manifest.push({ id: coverManifestId, filename: coverImageFilename, mediaType: book.cover.mimeType, properties: "cover-image" });

    const coverPageFilename = "cover.xhtml";
    oebps.file(coverPageFilename, coverPageHtml(book, coverImageFilename));
    manifest.push({ id: "cover-page", filename: coverPageFilename, mediaType: "application/xhtml+xml" });
    spineIds.push("cover-page");
  }

  spineIds.push("title");

  // Inline manuscript images: registered into the zip/manifest lazily, the
  // first time chapterPageHtml's rendering actually asks for one -- keyed
  // by the SAME Storage URL a "manuscriptImage" node stores, so an image
  // reused across multiple scenes/chapters (copy-pasted, or intentionally
  // reused) only gets zipped once and every reference points at that one
  // manifest entry, rather than duplicating the bytes per use.
  const imageFilenames = new Map<string, string>();
  let imageCounter = 0;
  function resolveImage(src: string): string | null {
    const cached = imageFilenames.get(src);
    if (cached) return cached;
    const asset = book.images?.[src];
    if (!asset) return null;
    imageCounter += 1;
    const id = `img-${imageCounter}`;
    const filename = `images/${id}.${asset.extension}`;
    oebps.file(filename, asset.bytes);
    manifest.push({ id, filename, mediaType: asset.mimeType });
    imageFilenames.set(src, filename);
    return filename;
  }
  const renderCtx: RenderContext = { resolveImage };

  // resolveSections() is the ONE place that numbers/files every part and
  // chapter, so the Contents page (which has to exist in the spine BEFORE
  // any chapter content, but needs to link to chapters that are written
  // AFTER it) and the real write loop below can never disagree on a
  // filename, title, or chapter number.
  const resolved = resolveSections(book.sections);

  const tocGroups = buildTocGroups(resolved);
  if (tocGroups.length > 0) {
    oebps.file("contents.xhtml", contentsXhtml(book, tocGroups));
    manifest.push({ id: "contents", filename: "contents.xhtml", mediaType: "application/xhtml+xml" });
    spineIds.push("contents");
  }

  for (const item of resolved) {
    if (item.kind === "part") {
      oebps.file(item.filename, partPageHtml(item.part!));
      manifest.push({ id: item.id, filename: item.filename, mediaType: "application/xhtml+xml" });
      spineIds.push(item.id);
      navEntries.push({ filename: item.filename, title: item.title, isPart: true });
    } else {
      oebps.file(item.filename, chapterPageHtml(item.chapter!, item.chapterNumber, renderCtx));
      manifest.push({ id: item.id, filename: item.filename, mediaType: "application/xhtml+xml" });
      spineIds.push(item.id);
      navEntries.push({ filename: item.filename, title: item.title, isPart: false });
    }
  }

  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  oebps.file("nav.xhtml", navXhtml(book, navEntries));
  oebps.file("toc.ncx", tocNcx(book, navEntries));
  oebps.file("content.opf", contentOpf(book, manifest, spineIds, modified, coverManifestId));

  const buffer = await zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
  return buffer;
}
