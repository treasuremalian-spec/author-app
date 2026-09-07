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
export type TrimSize = "5x8" | "6x9";

export const TRIM_SIZE_DIMENSIONS: Record<TrimSize, { width: string; height: string; label: string }> = {
  "5x8": { width: "5in", height: "8in", label: '5" x 8" (mass market / digest)' },
  "6x9": { width: "6in", height: "9in", label: '6" x 9" (trade paperback)' },
};
