"use client";

import { useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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

function buildPdfHref(projectId: string, trim: "6x9" | "5x8", options: PrintOptionsState): string {
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

export function ExportCard({ projectId }: { projectId: string }) {
  const [options, setOptions] = useState<PrintOptionsState>(DEFAULT_OPTIONS);

  const hrefs = useMemo(
    () => ({
      "6x9": buildPdfHref(projectId, "6x9", options),
      "5x8": buildPdfHref(projectId, "5x8", options),
    }),
    [projectId, options]
  );

  function toggle(key: keyof Omit<PrintOptionsState, "lineSpacing">) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
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
          A real, paginated book layout -- running headers, page numbers, and chapter starts, ready to send to a
          printer. Longer books can take a minute or two to generate, so give it a moment after you click.
        </p>

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
          <Button asChild size="sm" variant="outline">
            <a href={hrefs["6x9"]} download>
              <Download className="size-3.5" />
              6&quot; x 9&quot; (trade)
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={hrefs["5x8"]} download>
              <Download className="size-3.5" />
              5&quot; x 8&quot; (digest)
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
