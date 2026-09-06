// Assembles a real, valid EPUB3 file (a zip with a specific required
// structure) from a book's title/author plus its Part -> Chapter -> Scene
// tree. Deliberately hand-built with JSZip (pure JS, no native bindings)
// rather than a heavier EPUB library -- keeps this reliable in a serverless
// environment and easy to reason about.

import JSZip from "jszip";
import { sceneContentToXhtml, isSceneContentEmpty, escapeXml, type RenderContext } from "./tiptap-to-xhtml";

export interface EpubScene {
  id: string;
  content: unknown; // Tiptap/ProseMirror document JSON
}

export interface EpubChapter {
  id: string;
  title: string;
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

function chapterPageHtml(chapter: EpubChapter, ctx?: RenderContext): string {
  const nonEmptyScenes = chapter.scenes.filter((s) => !isSceneContentEmpty(s.content));
  const body = nonEmptyScenes
    .map((scene, i) => {
      const html = sceneContentToXhtml(scene.content, ctx);
      const divider = i > 0 ? `  <p class="scene-break">&#8258;</p>\n` : "";
      return `${divider}${html}`;
    })
    .join("\n");

  return xhtmlPage(
    chapter.title,
    `  <section epub:type="chapter">
    <h1>${escapeXml(chapter.title)}</h1>
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

  let chapterNumber = 0;
  let partNumber = 0;

  function addChapter(chapter: EpubChapter) {
    chapterNumber += 1;
    const id = `chapter-${chapterNumber}`;
    const filename = `${id}.xhtml`;
    oebps.file(filename, chapterPageHtml(chapter, renderCtx));
    manifest.push({ id, filename, mediaType: "application/xhtml+xml" });
    spineIds.push(id);
    navEntries.push({ filename, title: chapter.title || `Chapter ${chapterNumber}`, isPart: false });
  }

  for (const section of book.sections) {
    if (section.kind === "part") {
      partNumber += 1;
      const partId = `part-${partNumber}`;
      const partFilename = `${partId}.xhtml`;
      oebps.file(partFilename, partPageHtml(section.part));
      manifest.push({ id: partId, filename: partFilename, mediaType: "application/xhtml+xml" });
      spineIds.push(partId);
      navEntries.push({ filename: partFilename, title: section.part.title, isPart: true });

      for (const chapter of section.part.chapters) {
        addChapter(chapter);
      }
    } else {
      addChapter(section.chapter);
    }
  }

  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  oebps.file("nav.xhtml", navXhtml(book, navEntries));
  oebps.file("toc.ncx", tocNcx(book, navEntries));
  oebps.file("content.opf", contentOpf(book, manifest, spineIds, modified, coverManifestId));

  const buffer = await zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
  return buffer;
}
