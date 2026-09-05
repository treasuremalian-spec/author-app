// Assembles a real, valid EPUB3 file (a zip with a specific required
// structure) from a book's title/author plus its Part -> Chapter -> Scene
// tree. Deliberately hand-built with JSZip (pure JS, no native bindings)
// rather than a heavier EPUB library -- keeps this reliable in a serverless
// environment and easy to reason about.

import JSZip from "jszip";
import { sceneContentToXhtml, isSceneContentEmpty, escapeXml } from "./tiptap-to-xhtml";

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

export interface EpubBookInput {
  title: string;
  author: string;
  /** BCP 47 language tag, e.g. "en". Defaults to "en". */
  language?: string;
  /** A unique, stable string identifying this book -- does not need to be a real UUID. */
  identifier: string;
  /** Top-level Part/Chapter nodes, in reading order. */
  sections: EpubSection[];
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

function partPageHtml(part: EpubPart): string {
  return xhtmlPage(
    part.title,
    `  <section epub:type="part" class="part-divider">
    <h1>${escapeXml(part.title)}</h1>
  </section>`,
    "part-divider"
  );
}

function chapterPageHtml(chapter: EpubChapter): string {
  const nonEmptyScenes = chapter.scenes.filter((s) => !isSceneContentEmpty(s.content));
  const body = nonEmptyScenes
    .map((scene, i) => {
      const html = sceneContentToXhtml(scene.content);
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

function contentOpf(book: EpubBookInput, manifest: ManifestEntry[], spineIds: string[], modified: string): string {
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
    <meta property="dcterms:modified">${modified}</meta>
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
  const spineIds = ["title"];
  const navEntries: NavEntry[] = [];

  let chapterNumber = 0;
  let partNumber = 0;

  function addChapter(chapter: EpubChapter) {
    chapterNumber += 1;
    const id = `chapter-${chapterNumber}`;
    const filename = `${id}.xhtml`;
    oebps.file(filename, chapterPageHtml(chapter));
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
  oebps.file("content.opf", contentOpf(book, manifest, spineIds, modified));

  const buffer = await zip.generateAsync({ type: "nodebuffer", mimeType: "application/epub+zip" });
  return buffer;
}
