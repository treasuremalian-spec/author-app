// Parses a book's print options (trim size + PrintOptions, see
// print-html.ts) from a URL's query params -- shared by the real PDF
// export route (app/projects/[projectId]/export/pdf/route.ts) and the
// "Page Preview" route (app/projects/[projectId]/format/page-preview/
// route.ts, added 2026-09-11) so the two never drift on what a given
// query string means. Both routes are fed the SAME query string shape by
// FormatWorkspace.tsx (see its buildPrintOptionsQueryString()) -- Page
// Preview reuses the exact options the author currently has selected in
// the Format tab, the same way "Download PDF" already did, so what the
// author sees on screen and what they'd actually download are always the
// same choices.
import { ALL_TRIM_SIZES, DEFAULT_TRIM_SIZE } from "@author-app/formatting-engine/trim-sizes";
import type { TrimSize, PrintOptions } from "@author-app/formatting-engine";

// Validated against every real TrimSize (grew from just 5x8/6x9 to 15
// sizes 2026-09-11 -- see trim-sizes.ts) rather than a hardcoded list here,
// so a future trim size added there doesn't also need a matching edit in
// this file to actually become choosable.
export function parseTrimSize(value: string | null): TrimSize {
  if (value && (ALL_TRIM_SIZES as string[]).includes(value)) return value as TrimSize;
  return DEFAULT_TRIM_SIZE;
}

// Print options (Phase 15) come from query params set by FormatWorkspace.tsx's
// checkboxes/select -- each is optional and falls back to buildPrintHtml's
// own defaults (matching the pre-Phase-15 hardcoded behavior) when absent
// or unparseable, so an old/cached export link without these params still
// works exactly as before.
function parseBoolParam(value: string | null): boolean | undefined {
  if (value === null) return undefined;
  return value === "1" || value === "true";
}

function parseLineSpacing(value: string | null): number | undefined {
  if (value === null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1 || n > 3) return undefined;
  return n;
}

function parseBackgroundImageMode(value: string | null): PrintOptions["backgroundImageMode"] {
  if (value === "every_page" || value === "chapter_start") return value;
  if (value === "none") return "none";
  return undefined;
}

function parseBackgroundImageTextColor(value: string | null): PrintOptions["backgroundImageTextColor"] {
  if (value === "dark" || value === "light") return value;
  return undefined;
}

export function parsePrintOptions(searchParams: URLSearchParams): PrintOptions {
  return {
    mirroredMargins: parseBoolParam(searchParams.get("mirroredMargins")),
    indentParagraphs: parseBoolParam(searchParams.get("indentParagraphs")),
    dropCaps: parseBoolParam(searchParams.get("dropCaps")),
    chapterStartsOnRight: parseBoolParam(searchParams.get("chapterStartsOnRight")),
    showChapterTitles: parseBoolParam(searchParams.get("showChapterTitles")),
    backgroundImageMode: parseBackgroundImageMode(searchParams.get("backgroundImageMode")),
    backgroundImageTextColor: parseBackgroundImageTextColor(searchParams.get("backgroundImageTextColor")),
    backgroundImageChapterStartSpread: parseBoolParam(searchParams.get("backgroundImageChapterStartSpread")),
    largePrint: parseBoolParam(searchParams.get("largePrint")),
    lineSpacing: parseLineSpacing(searchParams.get("lineSpacing")),
    includeToc: parseBoolParam(searchParams.get("includeToc")),
  };
}
