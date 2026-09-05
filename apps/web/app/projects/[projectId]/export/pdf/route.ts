// Downloads a real, paginated print-ready PDF for a book -- a route
// handler (like the EPUB export) since it streams back an arbitrary
// binary file. Rendering runs a real headless Chromium (see
// formatting-engine/render-pdf.ts) which is real, if brief, CPU + wall
// time, so this is configured to run on the Node.js runtime with a
// generous max duration rather than Vercel's tiny defaults -- see project
// memory for why (Paged.js pagination of a full novel is genuinely slow
// compared to the EPUB export, which is near-instant string building).
import { NextRequest, NextResponse } from "next/server";
import { buildPrintHtml, renderPrintPdf, type TrimSize } from "@author-app/formatting-engine";
import { loadBookForExport, safeBookFilename } from "@/lib/export-data";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseTrimSize(value: string | null): TrimSize {
  return value === "5x8" ? "5x8" : "6x9";
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const trimSize = parseTrimSize(request.nextUrl.searchParams.get("trim"));

  const book = await loadBookForExport(projectId);
  const html = buildPrintHtml({ ...book, trimSize });
  const pdf = await renderPrintPdf(html);

  const safeFilename = safeBookFilename(book.title);
  const trimSuffix = trimSize.replace("x", "-");

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${safeFilename}-${trimSuffix}.pdf"`,
      "Content-Length": String(pdf.length),
    },
  });
}
