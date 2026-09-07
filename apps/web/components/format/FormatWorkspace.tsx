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
import type { TrimSize } from "@author-app/formatting-engine/trim-sizes";
import type { FormatPreviewData } from "@/lib/actions/format";
import { FormatPreview } from "./FormatPreview";
import { ReimportManuscriptDialog } from "./ReimportManuscriptDialog";

interface PrintOptionsState {
  mirroredMargins: boolean;
  indentParagraphs: boolean;
  dropCaps: boolean;
  chapterStartsOnRight: boolean;
  lineSpacing: string;
}

const DEFAULT_OPTIONS: PrintOptionsState = {
  mirroredMargins: false,
  indentParagraphs: true,
  dropCaps: false,
  chapterStartsOnRight: false,
  lineSpacing: "1.5",
};

function buildPdfHref(projectId: string, trim: TrimSize, options: PrintOptionsState): string {
  const params = new URLSearchParams({
    trim,
    mirroredMargins: options.mirroredMargins ? "1" : "0",
    indentParagraphs: options.indentParagraphs ? "1" : "0",
    dropCaps: options.dropCaps ? "1" : "0",
    chapterStartsOnRight: options.chapterStartsOnRight ? "1" : "0",
    lineSpacing: options.lineSpacing,
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
  const [previewTrim, setPreviewTrim] = useState<TrimSize>("6x9");
  // Server-rendered once by the page itself (see app/projects/[projectId]/
  // format/page.tsx) -- every later options change is a pure client-side
  // restyle of this same content (see FormatPreview.tsx), never a fresh
  // server call, which is what keeps the preview feeling "live" rather
  // than round-tripping on every checkbox click.
  const preview = initialPreview;

  function toggle(key: keyof Omit<PrintOptionsState, "lineSpacing">) {
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
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  asChild
                  size="sm"
                  variant={previewTrim === "6x9" ? "default" : "outline"}
                  onClick={() => setPreviewTrim("6x9")}
                >
                  <a href={buildPdfHref(projectId, "6x9", options)} download>
                    <Download className="size-3.5" />
                    6&quot; x 9&quot; (trade)
                  </a>
                </Button>
                <Button
                  asChild
                  size="sm"
                  variant={previewTrim === "5x8" ? "default" : "outline"}
                  onClick={() => setPreviewTrim("5x8")}
                >
                  <a href={buildPdfHref(projectId, "5x8", options)} download>
                    <Download className="size-3.5" />
                    5&quot; x 8&quot; (digest)
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
          }}
        />
      </div>
    </div>
  );
}
