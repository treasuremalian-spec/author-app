// Trim-size constants shared between the print/PDF export pipeline
// (print-html.ts, server-only -- it flows into render-pdf.ts's
// puppeteer-core/@sparticuz/chromium Node-only rendering) and the Format
// tab's live preview (apps/web/components/format/FormatPreview.tsx, a
// CLIENT component). Pulled into their own file with NO other imports so
// a client component can import just this, rather than the
// formatting-engine package's barrel index.ts, which also re-exports
// those server-only, Node-only pipelines.
//
// Confirmed 2026-09-07 via a real local `next build` (see project memory
// on why local builds otherwise can't be trusted -- this failure mode is
// independent of that, a pure bundling issue, not a stale-Prisma-client
// one): before this file existed, FormatPreview.tsx importing
// TRIM_SIZE_DIMENSIONS from the barrel pulled puppeteer-core's whole
// dependency graph into the CLIENT bundle and failed the build with
// "Module not found: Can't resolve 'fs'" -- the same class of mistake as
// the "use server" file exporting a non-async const bug hit earlier this
// session (see sprint-constants.ts's own history for that one), just
// surfacing on the client-bundling side instead of the server-action
// side. Any other genuinely client-safe formatting-engine constant should
// get the same treatment rather than being added to print-html.ts/
// build-epub.ts/etc. and re-exported through the barrel.
//
// Expanded 2026-09-11 from just 5x8/6x9 to the fuller Vellum-style list
// Tasia asked for (screenshot reference, 2026-09-07 backlog note): 15
// distinct physical trim sizes across 4 categories. NOTE: her reference
// list also had a 5th category, "Large print", but it repeated the exact
// same 4 physical sizes already listed under Popular/Full size (5.5x8.5,
// 6x9, 6.14x9.21, 7x10) -- confirmed with her (2026-09-11) that "large
// print" isn't actually a distinct set of page sizes, it's a bigger BODY
// FONT, usable with whatever trim size you've already picked. So it's
// NOT a TrimSize/TRIM_SIZE_DIMENSIONS entry at all -- see
// PrintOptions.largePrint in print-html.ts instead, a separate flag
// orthogonal to trim size.
export type TrimSize =
  | "5x8"
  | "5.25x8"
  | "5.5x8.5"
  | "6x9"
  | "5.06x7.81"
  | "5.5x8.25"
  | "6.14x9.21"
  | "4x6"
  | "4.12x6.75"
  | "4.25x7"
  | "4.37x7"
  | "7x10"
  | "8x10"
  | "8.25x11"
  | "8.5x11";

export const TRIM_SIZE_DIMENSIONS: Record<TrimSize, { width: string; height: string; label: string }> = {
  "5x8": { width: "5in", height: "8in", label: '5" x 8"' },
  "5.25x8": { width: "5.25in", height: "8in", label: '5.25" x 8"' },
  "5.5x8.5": { width: "5.5in", height: "8.5in", label: '5.5" x 8.5"' },
  "6x9": { width: "6in", height: "9in", label: '6" x 9" (trade paperback)' },
  "5.06x7.81": { width: "5.06in", height: "7.81in", label: '5.06" x 7.81"' },
  "5.5x8.25": { width: "5.5in", height: "8.25in", label: '5.5" x 8.25"' },
  "6.14x9.21": { width: "6.14in", height: "9.21in", label: '6.14" x 9.21"' },
  "4x6": { width: "4in", height: "6in", label: '4" x 6" (mass market)' },
  "4.12x6.75": { width: "4.12in", height: "6.75in", label: '4.12" x 6.75" (mass market)' },
  "4.25x7": { width: "4.25in", height: "7in", label: '4.25" x 7" (mass market)' },
  "4.37x7": { width: "4.37in", height: "7in", label: '4.37" x 7" (mass market)' },
  "7x10": { width: "7in", height: "10in", label: '7" x 10" (full size)' },
  "8x10": { width: "8in", height: "10in", label: '8" x 10" (full size)' },
  "8.25x11": { width: "8.25in", height: "11in", label: '8.25" x 11" (full size)' },
  "8.5x11": { width: "8.5in", height: "11in", label: '8.5" x 11" (full size)' },
};

/** Groups TRIM_SIZE_DIMENSIONS the same way Tasia's reference screenshot
 * did (2026-09-07), for a categorized <select> in the Format tab rather
 * than one long flat list of 15 sizes -- "Large print" deliberately isn't
 * one of these groups, see the file comment above. */
export const TRIM_SIZE_GROUPS: { label: string; sizes: TrimSize[] }[] = [
  { label: "Popular", sizes: ["5x8", "5.25x8", "5.5x8.5", "6x9"] },
  { label: "Additional", sizes: ["5.06x7.81", "5.5x8.25", "6.14x9.21"] },
  { label: "Mass market paperback", sizes: ["4x6", "4.12x6.75", "4.25x7", "4.37x7"] },
  { label: "Full size", sizes: ["7x10", "8x10", "8.25x11", "8.5x11"] },
];

/** Every valid TrimSize value, for runtime validation (e.g. parsing the
 * "trim" query param in export/pdf/route.ts) -- kept in sync with the
 * TrimSize union above by construction, since it's just that union's own
 * keys. */
export const ALL_TRIM_SIZES: TrimSize[] = Object.keys(TRIM_SIZE_DIMENSIONS) as TrimSize[];

export const DEFAULT_TRIM_SIZE: TrimSize = "6x9";
