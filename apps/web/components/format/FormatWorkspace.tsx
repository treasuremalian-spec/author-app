"use client";

// The "Format & Export" project tab -- previously this project's export
// controls lived in a Card on the Overview page (see the old
// components/overview/ExportCard.tsx, now just a small link pointing
// here); per author request (2026-09-07) formatting/export gets its own
// dedicated tab, with a live preview pane alongside the controls so an
// author can see roughly how a choice will look before spending a minute
// or two generating a real PDF.

import { useState } from "react";
import { Download, FileText, Upload } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { TRIM_SIZE_GROUPS, TRIM_SIZE_DIMENSIONS, DEFAULT_TRIM_SIZE, type TrimSize } from "@author-app/formatting-engine/trim-sizes";
import type { FormatPreviewData } from "@/lib/actions/format";
import { FormatPreview } from "./FormatPreview";
import { ReimportManuscriptDialog } from "./ReimportManuscriptDialog";
import { BackgroundImageUploadButton } from "./BackgroundImageUploadButton";

interface PrintOptionsState {
  mirroredMargins: boolean;
  indentParagraphs: boolean;
  dropCaps: boolean;
  chapterStartsOnRight: boolean;
  showChapterTitles: boolean;
  lineSpacing: string;
  /** "none" (default), "every_page", or "chapter_start" -- see
   * PrintOptions.backgroundImageMode in print-html.ts. Has no visible
   * effect until a background image has actually been uploaded (see the
   * backgroundImageUrl state in FormatWorkspace below, not part of this
   * options bag since it's a persisted per-project asset, not a
   * per-export choice). PDF-only, per author request 2026-09-07 ("those
   * will only show up in PDF files not the epub") -- never sent to the
   * EPUB download link. */
  backgroundImageMode: "none" | "every_page" | "chapter_start";
  /** Whether text overlaid on the background image renders dark (default,
   * normal manuscript-text color) or light/white. Author-chosen per
   * request 2026-09-08 ("instead of lighten the background make an
   * option to have text black or white") -- replaces an earlier
   * automatic semi-opaque white wash behind the photo, which the author
   * didn't want (she'd rather the photo show at full strength and pick
   * the text color herself). Only meaningful when backgroundImageMode
   * isn't "none". */
  backgroundImageTextColor: "dark" | "light";
  /** Only meaningful when backgroundImageMode is "chapter_start". Shows
   * the SAME background photo as a real two-page spread -- split across
   * the blank page right before a chapter opens and the chapter's own
   * opening page, one continuous image -- rather than only behind the
   * single chapter-start page. Author request, 2026-09-11 (clarifying
   * that an earlier "double spread" feature she'd asked for was actually
   * about this background-image option, not the separate inline
   * manuscript-image spread mode, which she confirmed she still wants
   * kept as its own thing). */
  backgroundImageChapterStartSpread: boolean;
  /** Bumps the book's body text up to a real large-print size, independent
   * of trim size -- see PrintOptions.largePrint's doc comment in
   * print-html.ts for why this is a standalone flag rather than a
   * "Large print" group of trim sizes (the author's own reference list
   * repeated the same 4 physical page sizes already offered under
   * Popular/Full size, confirmed 2026-09-11 that what she actually wants
   * is bigger body text, usable with any trim). */
  largePrint: boolean;
}

const DEFAULT_OPTIONS: PrintOptionsState = {
  mirroredMargins: false,
  indentParagraphs: true,
  dropCaps: false,
  chapterStartsOnRight: false,
  showChapterTitles: true,
  lineSpacing: "1.5",
  backgroundImageMode: "none",
  backgroundImageTextColor: "dark",
  backgroundImageChapterStartSpread: false,
  largePrint: false,
};

function buildPdfHref(projectId: string, trim: TrimSize, options: PrintOptionsState): string {
  const params = new URLSearchParams({
    trim,
    mirroredMargins: options.mirroredMargins ? "1" : "0",
    indentParagraphs: options.indentParagraphs ? "1" : "0",
    dropCaps: options.dropCaps ? "1" : "0",
    chapterStartsOnRight: options.chapterStartsOnRight ? "1" : "0",
    showChapterTitles: options.showChapterTitles ? "1" : "0",
    lineSpacing: options.lineSpacing,
    backgroundImageMode: options.backgroundImageMode,
    backgroundImageTextColor: options.backgroundImageTextColor,
    backgroundImageChapterStartSpread: options.backgroundImageChapterStartSpread ? "1" : "0",
    largePrint: options.largePrint ? "1" : "0",
  });
  return `/projects/${projectId}/export/pdf?${params.toString()}`;
}

export function FormatWorkspace({
  projectId,
  initialPreview,
}: {
  projectId: string;
  initialPreview: FormatPreviewData;
}) {
  const [options, setOptions] = useState<PrintOptionsState>(DEFAULT_OPTIONS);
  const [previewTrim, setPreviewTrim] = useState<TrimSize>(DEFAULT_TRIM_SIZE);
  // Server-rendered once by the page itself (see app/projects/[projectId]/
  // format/page.tsx) -- every later options change is a pure client-side
  // restyle of this same content (see FormatPreview.tsx), never a fresh
  // server call, which is what keeps the preview feeling "live" rather
  // than round-tripping on every checkbox click.
  const preview = initialPreview;
  const [backgroundImageUrl, setBackgroundImageUrl] = useState<string | null>(preview.backgroundImageUrl);

  function toggle(key: keyof Omit<PrintOptionsState, "lineSpacing" | "backgroundImageMode" | "backgroundImageTextColor">) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/20">
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[1.15fr_1fr]">
        <div className="space-y-5">
          <Card className="flex flex-col gap-4 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Download your manuscript as a real e-book file -- opens in Kindle, Apple Books, Kobo, and more.
              </p>
            </div>
            <Button asChild size="sm" className="w-fit">
              <a href={`/projects/${projectId}/export/epub`} download>
                <Download className="size-3.5" />
                Download EPUB
              </a>
            </Button>

            <div className="border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Print-ready PDF</p>
              <p className="mt-1 text-sm text-muted-foreground">
                A real, paginated book layout -- running headers, page numbers, and chapter starts, ready to send to
                a printer. Longer books can take a minute or two to generate, so give it a moment after you click.
              </p>
              {preview?.hasSpreadImage && (
                <p className="mt-2 rounded-md bg-accent/10 px-2.5 py-1.5 text-xs text-accent-foreground">
                  This book has a full-page spread image, so every page will print 0.125&quot; larger on each side
                  for real print bleed -- your printer trims that away.
                </p>
              )}

              <div className="mt-3 space-y-2.5 rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Print options</p>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input"
                    checked={options.mirroredMargins}
                    onChange={() => toggle("mirroredMargins")}
                  />
                  Mirrored margins (bigger margin toward the spine, like a professionally bound book)
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input"
                    checked={options.indentParagraphs}
                    onChange={() => toggle("indentParagraphs")}
                  />
                  Indent paragraphs
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input"
                    checked={options.dropCaps}
                    onChange={() => toggle("dropCaps")}
                  />
                  Drop caps at the start of each chapter
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input"
                    checked={options.chapterStartsOnRight}
                    onChange={() => toggle("chapterStartsOnRight")}
                  />
                  Start every chapter on a right-hand page (adds a blank page when needed)
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input"
                    checked={options.showChapterTitles}
                    onChange={() => toggle("showChapterTitles")}
                  />
                  Show chapter titles (each chapter still starts on its own page when off)
                </label>

                <div className="border-t pt-2.5 mt-1">
                  <p className="text-sm font-medium">Background image (PDF only)</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    A full-page image behind the text -- shows up in the print PDF only, never in the EPUB.
                  </p>
                  <div className="mt-2">
                    <BackgroundImageUploadButton
                      projectId={projectId}
                      backgroundImageUrl={backgroundImageUrl}
                      onChange={setBackgroundImageUrl}
                    />
                  </div>
                  {backgroundImageUrl && (
                    <div className="mt-2 flex items-center gap-2">
                      <Label htmlFor="background-image-mode" className="text-sm font-normal text-foreground">
                        Show it
                      </Label>
                      <select
                        id="background-image-mode"
                        className="h-8 rounded-md border border-input bg-card px-2 text-sm shadow-sm"
                        value={options.backgroundImageMode}
                        onChange={(event) =>
                          setOptions((prev) => ({
                            ...prev,
                            backgroundImageMode: event.target.value as PrintOptionsState["backgroundImageMode"],
                          }))
                        }
                      >
                        <option value="none">Not at all</option>
                        <option value="every_page">Behind every page</option>
                        <option value="chapter_start">Behind each chapter&apos;s first page only</option>
                      </select>
                    </div>
                  )}
                  {backgroundImageUrl && options.backgroundImageMode === "chapter_start" && (
                    <label className="mt-2 flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-3.5 rounded border-input"
                        checked={options.backgroundImageChapterStartSpread}
                        onChange={() =>
                          setOptions((prev) => ({
                            ...prev,
                            backgroundImageChapterStartSpread: !prev.backgroundImageChapterStartSpread,
                          }))
                        }
                      />
                      Spread across two facing pages (the blank page before the chapter, plus its opening page)
                    </label>
                  )}
                  {backgroundImageUrl && options.backgroundImageMode !== "none" && (
                    <div className="mt-2 flex items-center gap-2">
                      <Label htmlFor="background-image-text-color" className="text-sm font-normal text-foreground">
                        Text color over the image
                      </Label>
                      <select
                        id="background-image-text-color"
                        className="h-8 rounded-md border border-input bg-card px-2 text-sm shadow-sm"
                        value={options.backgroundImageTextColor}
                        onChange={(event) =>
                          setOptions((prev) => ({
                            ...prev,
                            backgroundImageTextColor: event.target.value as PrintOptionsState["backgroundImageTextColor"],
                          }))
                        }
                      >
                        <option value="dark">Dark (normal)</option>
                        <option value="light">Light / white</option>
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Label htmlFor="line-spacing" className="text-sm font-normal text-foreground">
                    Line spacing
                  </Label>
                  <select
                    id="line-spacing"
                    className="h-8 rounded-md border border-input bg-card px-2 text-sm shadow-sm"
                    value={options.lineSpacing}
                    onChange={(event) => setOptions((prev) => ({ ...prev, lineSpacing: event.target.value }))}
                  >
                    <option value="1.3">Compact</option>
                    <option value="1.4">Cozy</option>
                    <option value="1.5">Standard</option>
                    <option value="1.6">Relaxed</option>
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input"
                    checked={options.largePrint}
                    onChange={() => toggle("largePrint")}
                  />
                  Large print (bigger body text -- works with any trim size below)
                </label>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Label htmlFor="trim-size" className="text-sm font-normal text-foreground">
                  Trim size
                </Label>
                <select
                  id="trim-size"
                  className="h-8 rounded-md border border-input bg-card px-2 text-sm shadow-sm"
                  value={previewTrim}
                  onChange={(event) => setPreviewTrim(event.target.value as TrimSize)}
                >
                  {TRIM_SIZE_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.sizes.map((size) => (
                        <option key={size} value={size}>
                          {TRIM_SIZE_DIMENSIONS[size].label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <Button asChild size="sm">
                  <a href={buildPdfHref(projectId, previewTrim, options)} download>
                    <Download className="size-3.5" />
                    Download PDF
                  </a>
                </Button>
              </div>
            </div>
          </Card>

          <Card className="flex flex-col gap-3 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Word document</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Standard manuscript format -- Times New Roman, double-spaced, 1&quot; margins -- ready to send to an
                editor, agent, or beta reader who wants a plain, markup-friendly file.
              </p>
            </div>
            <Button asChild size="sm" variant="outline" className="w-fit">
              <a href={`/projects/${projectId}/export/docx`} download>
                <FileText className="size-3.5" />
                Download Word (.docx)
              </a>
            </Button>

            <div className="border-t pt-3">
              <p className="text-sm font-medium">Send your manuscript out for edits</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Download the Word file above, get it edited (track changes and all), then bring the edited file back
                in here -- it replaces this book&apos;s chapters and scenes with the edited version.
              </p>
              <div className="mt-2">
                <ReimportManuscriptDialog projectId={projectId} projectTitle={preview.title}>
                  <Button size="sm" variant="outline">
                    <Upload className="size-3.5" />
                    Re-import edited manuscript
                  </Button>
                </ReimportManuscriptDialog>
              </div>
            </div>
          </Card>
        </div>

        <FormatPreview
          data={preview}
          options={{
            mirroredMargins: options.mirroredMargins,
            indentParagraphs: options.indentParagraphs,
            dropCaps: options.dropCaps,
            lineSpacing: options.lineSpacing,
            trimSize: previewTrim,
            showChapterTitles: options.showChapterTitles,
            backgroundImageUrl,
            backgroundImageMode: options.backgroundImageMode,
            backgroundImageTextColor: options.backgroundImageTextColor,
            backgroundImageChapterStartSpread: options.backgroundImageChapterStartSpread,
            largePrint: options.largePrint,
          }}
        />
      </div>
    </div>
  );
}
