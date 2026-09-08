"use client";

// The Format tab's live preview pane (see FormatWorkspace.tsx) -- a
// page-shaped, scrollable window onto the WHOLE manuscript (author
// request, 2026-09-07: "ability to scroll the entire book in the
// preview" -- this used to show only a single fixed page of the book's
// first chapter), restyled instantly (no server round-trip) as the author
// toggles print options. This is deliberately NOT a real Paged.js
// pagination preview -- running the actual headless-Chromium PDF pipeline
// (see render-pdf.ts) on every checkbox click would be far too slow for
// something meant to feel live, and doesn't change what's needed here:
// one continuously-flowing column, the width/margins of a real page,
// that the author scrolls through like a long document -- using the SAME
// visual constants (margins, font, drop-cap look) as print-html.ts's
// buildCss() -- if those numbers change there, they should change here
// too, so the preview stays honest about what a real export will look
// like.
//
// A real PDF export remains the only way to see true pagination (page
// breaks, running headers/footers, mirrored left/right margins across
// facing pages) -- this preview only ever shows one continuous flow, not
// discrete pages.

import type { CSSProperties } from "react";
import { TRIM_SIZE_DIMENSIONS, type TrimSize } from "@author-app/formatting-engine/trim-sizes";
import type { FormatPreviewData } from "@/lib/actions/format";

export interface PreviewOptions {
  mirroredMargins: boolean;
  indentParagraphs: boolean;
  dropCaps: boolean;
  lineSpacing: string;
  trimSize: TrimSize;
  /** Mirrors PrintOptions.showChapterTitles (print-html.ts) -- when false,
   * each chapter still gets its own clearly separated block as you scroll,
   * just without the visible heading text. */
  showChapterTitles: boolean;
  /** The book's background image (Project.backgroundImageUrl), if one has
   * been uploaded -- null shows no background regardless of mode below.
   * PDF-only feature (author request, 2026-09-07); this preview only
   * approximates it, since a real PDF page and this continuously-scrolled
   * preview aren't the same shape (see backgroundImageMode below). */
  backgroundImageUrl: string | null;
  /** Mirrors PrintOptions.backgroundImageMode (print-html.ts). "every_page"
   * paints the background behind the whole scrollable preview window,
   * which is the closest single-page-shaped stand-in this preview has for
   * "every page of the real PDF." "chapter_start" can't be shown the same
   * way a real paginated PDF shows it (this preview has no discrete
   * pages) -- instead each chapter gets one page-shaped band, sized to
   * the chosen trim's real aspect ratio, with the background image behind
   * just its opening title, then the chapter's normal (background-free)
   * body text continues below it -- an honest approximation of "only the
   * first page of this chapter," not a literal pagination. */
  backgroundImageMode: "none" | "every_page" | "chapter_start";
  /** Mirrors PrintOptions.backgroundImageTextColor (print-html.ts).
   * Author-chosen (request 2026-09-08) in place of the earlier automatic
   * white wash: the photo now shows at full strength and the author picks
   * whether the overlaid text reads dark (normal) or light/white. Only
   * meaningful when backgroundImageMode isn't "none". */
  backgroundImageTextColor: "dark" | "light";
}

// Mirrors print-html.ts's buildCss() margin constants (non-bleed values --
// the preview never needs to reflect bleed, since bleed only changes the
// PHYSICAL page size around the trim line, not anything visible within
// it). Keep these two files' numbers in sync if either changes.
const MARGIN_TOP_IN = 0.8;
const MARGIN_BOTTOM_IN = 0.9;
const MARGIN_OUTSIDE_IN = 0.6;
const MARGIN_INSIDE_IN = 0.85;
const FLAT_MARGIN_IN = 0.65;

export function FormatPreview({ data, options }: { data: FormatPreviewData | null; options: PreviewOptions }) {
  const { width, height } = TRIM_SIZE_DIMENSIONS[options.trimSize];
  const widthIn = parseFloat(width);
  const heightIn = parseFloat(height);

  // A mirrored-margins book's very first page is conventionally a recto
  // (right-hand) page -- inside margin on the left -- so the preview shows
  // that side, matching what an author would actually see first.
  const marginLeftIn = options.mirroredMargins ? MARGIN_INSIDE_IN : FLAT_MARGIN_IN;
  const marginRightIn = options.mirroredMargins ? MARGIN_OUTSIDE_IN : FLAT_MARGIN_IN;

  // The box's aspect-ratio gives it the width/height proportions of one
  // real page of the chosen trim size -- with the whole book's content
  // inside it and overflow-y: auto, that box becomes a page-shaped WINDOW
  // the author scrolls the manuscript through, rather than a single fixed
  // page (see the file comment above).
  const showEveryPageBackground = options.backgroundImageMode === "every_page" && !!options.backgroundImageUrl;
  const showChapterStartBackground = options.backgroundImageMode === "chapter_start" && !!options.backgroundImageUrl;

  const pageStyle: CSSProperties = {
    aspectRatio: `${widthIn} / ${heightIn}`,
    paddingTop: `${(MARGIN_TOP_IN / widthIn) * 100}%`,
    paddingBottom: `${(MARGIN_BOTTOM_IN / widthIn) * 100}%`,
    paddingLeft: `${(marginLeftIn / widthIn) * 100}%`,
    paddingRight: `${(marginRightIn / widthIn) * 100}%`,
    overflowY: "auto",
    overflowX: "hidden",
    ...(showEveryPageBackground
      ? {
          // The photo itself, at full strength -- no dimming layer.
          // Legibility is the author's own call now (backgroundImageTextColor
          // below), per request 2026-09-08 ("instead of lighten the
          // background make an option to have text black or white"),
          // replacing the earlier automatic white wash.
          backgroundImage: `url(${options.backgroundImageUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          color: options.backgroundImageTextColor === "light" ? "#fff" : undefined,
        }
      : {}),
  };

  const bodyStyle: CSSProperties = {
    lineHeight: options.lineSpacing,
    textIndent: options.indentParagraphs ? "1.5em" : 0,
    marginBottom: options.indentParagraphs ? undefined : "0.9em",
  };

  const chapters = data?.chapters ?? [];

  return (
    <div className="sticky top-4 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p>
      <div
        className="w-full rounded-md border border-border bg-white shadow-sm"
        style={pageStyle}
      >
        <div className="format-preview-page">
          {data ? (
            chapters.map((chapter, index) => (
              <section key={index} className={`format-preview-page__chapter${index > 0 ? " format-preview-page__chapter--break" : ""}`}>
                {showChapterStartBackground ? (
                  <div
                    className="format-preview-page__chapter-start-band"
                    style={{
                      aspectRatio: `${widthIn} / ${heightIn}`,
                      // The photo itself, at full strength -- no dimming
                      // layer. The chapter title's own color (dark by
                      // default, or white -- see backgroundImageTextColor
                      // below) is the author's legibility choice now,
                      // replacing the earlier automatic white wash.
                      backgroundImage: `url(${options.backgroundImageUrl})`,
                    }}
                  >
                    {options.showChapterTitles && (
                      <h1
                        className="format-preview-page__title format-preview-page__title--on-band"
                        style={options.backgroundImageTextColor === "light" ? { color: "#fff" } : undefined}
                      >
                        {chapter.title}
                      </h1>
                    )}
                  </div>
                ) : (
                  options.showChapterTitles && <h1 className="format-preview-page__title">{chapter.title}</h1>
                )}
                <div
                  className={`format-preview-page__body${options.dropCaps ? " format-preview-page__body--drop-cap" : ""}${
                    options.indentParagraphs ? "" : " format-preview-page__body--block"
                  }`}
                  style={bodyStyle}
                  dangerouslySetInnerHTML={{ __html: chapter.html }}
                />
              </section>
            ))
          ) : (
            <p className="format-preview-page__body">Loading preview...</p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Scroll to page through your whole manuscript as you format -- download a PDF to see real pagination, running
        headers, and page breaks.
      </p>
      <style>{`
        .format-preview-page {
          font-family: Georgia, "Times New Roman", serif;
          color: #1a1a1a;
          font-size: clamp(9px, 1.6cqw, 13px);
          container-type: inline-size;
        }
        .format-preview-page__chapter--break {
          margin-top: 2.6em;
          padding-top: 2em;
          border-top: 1px dashed rgba(0, 0, 0, 0.12);
        }
        .format-preview-page__title {
          text-align: center;
          font-weight: normal;
          letter-spacing: 0.04em;
          font-size: 1.6em;
          margin: 0 0 1.4em;
        }
        .format-preview-page__chapter-start-band {
          position: relative;
          width: 100%;
          margin: 0 0 1.4em;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          border-radius: 0.25em;
          display: flex;
          align-items: flex-end;
          justify-content: center;
          overflow: hidden;
        }
        .format-preview-page__title--on-band {
          position: relative;
          margin: 0 0 0.9em;
        }
        .format-preview-page__body p {
          margin: 0;
          text-align: justify;
        }
        .format-preview-page__body--block p {
          margin-bottom: 0.9em;
        }
        .format-preview-page__body--drop-cap > p:first-child::first-letter {
          float: left;
          font-size: 3em;
          line-height: 0.8;
          font-weight: 700;
          padding-right: 0.08em;
        }
        .format-preview-page__body .scene-break {
          text-align: center;
          text-indent: 0;
          margin: 1em 0;
          letter-spacing: 0.3em;
        }
        .format-preview-page__body img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}
