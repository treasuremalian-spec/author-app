"use client";

// The Format tab's live preview pane (see FormatWorkspace.tsx) -- a
// single scaled "page" showing the book's first written chapter, restyled
// instantly (no server round-trip) as the author toggles print options.
// This is deliberately NOT a real Paged.js pagination preview -- running
// the actual headless-Chromium PDF pipeline (see render-pdf.ts) on every
// checkbox click would be far too slow for something meant to feel live,
// and genuinely isn't needed just to see "does this look right" for one
// page's worth of margins/indent/line-spacing/drop-caps. Instead this is
// a plain styled <div> shaped like a page, sized to the real trim-size
// aspect ratio, using the SAME visual constants (margins, font, drop-cap
// look) as print-html.ts's buildCss() -- if those numbers change there,
// they should change here too, so the preview stays honest about what a
// real export will look like.
//
// A real PDF export remains the only way to see true pagination (page
// breaks, running headers/footers, mirrored left/right margins across
// facing pages) -- this preview only ever shows one page's worth of the
// opening of the book.

import type { CSSProperties } from "react";
import { TRIM_SIZE_DIMENSIONS, type TrimSize } from "@author-app/formatting-engine/trim-sizes";
import type { FormatPreviewData } from "@/lib/actions/format";

export interface PreviewOptions {
  mirroredMargins: boolean;
  indentParagraphs: boolean;
  dropCaps: boolean;
  lineSpacing: string;
  trimSize: TrimSize;
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

  const pageStyle: CSSProperties = {
    aspectRatio: `${widthIn} / ${heightIn}`,
    paddingTop: `${(MARGIN_TOP_IN / widthIn) * 100}%`,
    paddingBottom: `${(MARGIN_BOTTOM_IN / widthIn) * 100}%`,
    paddingLeft: `${(marginLeftIn / widthIn) * 100}%`,
    paddingRight: `${(marginRightIn / widthIn) * 100}%`,
  };

  const bodyStyle: CSSProperties = {
    lineHeight: options.lineSpacing,
    textIndent: options.indentParagraphs ? "1.5em" : 0,
    marginBottom: options.indentParagraphs ? undefined : "0.9em",
  };

  return (
    <div className="sticky top-4 flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live preview</p>
      <div
        className="w-full overflow-hidden rounded-md border border-border bg-white shadow-sm"
        style={pageStyle}
      >
        <div className="format-preview-page">
          <h1 className="format-preview-page__title">{data?.chapterTitle || "Chapter One"}</h1>
          {data ? (
            <div
              className={`format-preview-page__body${options.dropCaps ? " format-preview-page__body--drop-cap" : ""}${
                options.indentParagraphs ? "" : " format-preview-page__body--block"
              }`}
              style={bodyStyle}
              dangerouslySetInnerHTML={{ __html: data.chapterHtml }}
            />
          ) : (
            <p className="format-preview-page__body">Loading preview...</p>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A quick look at your opening page as you format -- download a PDF to see real pagination, running headers,
        and page breaks.
      </p>
      <style>{`
        .format-preview-page {
          font-family: Georgia, "Times New Roman", serif;
          color: #1a1a1a;
          font-size: clamp(9px, 1.6cqw, 13px);
          container-type: inline-size;
        }
        .format-preview-page__title {
          text-align: center;
          font-weight: normal;
          letter-spacing: 0.04em;
          font-size: 1.6em;
          margin: 0 0 1.4em;
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
