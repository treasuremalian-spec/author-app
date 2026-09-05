// Builds one complete, self-contained HTML document for a book's print
// edition: a title page, part dividers, and chapters with running headers,
// page numbers, and chapter-start pages -- using standard CSS Paged Media
// rules (@page, string-set, named pages) that the Paged.js polyfill (see
// render-pdf.ts) turns into real, fixed-size, paginated pages before we
// hand the result to a real headless browser to print as a PDF.
//
// Deliberately built as one flat HTML document rather than per-chapter
// files (unlike the EPUB build) -- Paged.js needs the whole book in one
// flow to paginate it correctly, with page breaks as a side effect of
// CSS rather than a structural choice we make ourselves.

import { sceneContentToXhtml, isSceneContentEmpty, escapeXml } from "./tiptap-to-xhtml";
import type { EpubBookInput, EpubChapter, EpubPart, EpubSection } from "./build-epub";

export type TrimSize = "5x8" | "6x9";

export const TRIM_SIZE_DIMENSIONS: Record<TrimSize, { width: string; height: string; label: string }> = {
  "5x8": { width: "5in", height: "8in", label: '5" x 8" (mass market / digest)' },
  "6x9": { width: "6in", height: "9in", label: '6" x 9" (trade paperback)' },
};

export interface PrintBookInput extends EpubBookInput {
  trimSize: TrimSize;
}

function sceneHtml(content: unknown, isFirstNonEmptyInChapter: boolean): string {
  const divider = isFirstNonEmptyInChapter ? "" : `<p class="scene-break">⁂</p>\n`;
  return `${divider}${sceneContentToXhtml(content)}`;
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

  return `<section class="chapter">
  <div class="chapter-start">
    <h1 class="chapter-title">${escapeXml(label)}</h1>
  </div>
  ${scenesHtml}
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

function buildCss(trimSize: TrimSize): string {
  const { width, height } = TRIM_SIZE_DIMENSIONS[trimSize];
  return `
@page {
  size: ${width} ${height};
  margin: 0.8in 0.65in 0.9in 0.65in;
  @top-center {
    content: string(chaptertitle);
    font-family: Georgia, "Times New Roman", serif;
    font-size: 8.5pt;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #666;
  }
  @bottom-center {
    content: counter(page);
    font-family: Georgia, "Times New Roman", serif;
    font-size: 9pt;
    color: #333;
  }
}
@page :first {
  @top-center { content: none; }
  @bottom-center { content: none; }
}
@page titlepage {
  @top-center { content: none; }
  @bottom-center { content: none; }
}
@page cover {
  margin: 0;
  @top-center { content: none; }
  @bottom-center { content: none; }
}
@page chapterstart {
  @top-center { content: none; }
}

html, body {
  margin: 0;
  padding: 0;
}
body {
  font-family: Georgia, "Times New Roman", serif;
  font-size: 11.5pt;
  line-height: 1.5;
  color: #1a1a1a;
}
p {
  margin: 0;
  text-align: justify;
  text-indent: 1.5em;
  orphans: 2;
  widows: 2;
  hyphens: auto;
}
.chapter-start + p,
.scene-break + p {
  text-indent: 0;
}
.scene-break {
  text-align: center;
  text-indent: 0;
  margin: 1em 0;
  letter-spacing: 0.3em;
}
h2, h3, h4, h5, h6 {
  font-family: Georgia, "Times New Roman", serif;
  text-indent: 0;
  margin: 1em 0 0.5em;
}

.cover-page {
  page: cover;
  break-after: page;
  margin: 0;
  padding: 0;
}
.cover-page img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.titlepage, .part-divider {
  page: titlepage;
  break-before: page;
  break-after: page;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
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
  break-before: page;
  page: chapterstart;
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
export function buildPrintHtml(book: PrintBookInput): string {
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
<style>${buildCss(book.trimSize)}</style>
</head>
<body>
${book.cover ? `<section class="cover-page">
  <img src="data:${book.cover.mimeType};base64,${Buffer.from(book.cover.bytes).toString("base64")}" alt=""/>
</section>
` : ""}<section class="titlepage">
  <h1>${escapeXml(book.title)}</h1>
  <p class="byline">${escapeXml(book.author)}</p>
</section>
${sectionsHtml}
</body>
</html>`;
}
