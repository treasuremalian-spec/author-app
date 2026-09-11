// Downloads a real, paginated print-ready PDF for a book -- a route
// handler (like the EPUB export) since it streams back an arbitrary
// binary file. Rendering runs a real headless Chromium (see
// formatting-engine/render-pdf.ts) which is real, if brief, CPU + wall
// time, so this is configured to run on the Node.js runtime with a
// generous max duration rather than Vercel's tiny defaults -- see project
// memory for why (Paged.js pagination of a full novel is genuinely slow
// compared to the EPUB export, which is near-instant string building).
import { NextRequest, NextResponse } from "next/server";
import { buildPrintHtml, renderPrintPdf } from "@author-app/formatting-engine";
import { loadBookForExport, safeBookFilename } from "@/lib/export-data";
import { parseTrimSize, parsePrintOptions } from "@/lib/print-options-query";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const trimSize = parseTrimSize(request.nextUrl.searchParams.get("trim"));
  const printOptions = parsePrintOptions(request.nextUrl.searchParams);

  try {
    const book = await loadBookForExport(projectId);
    const { html, pageWidthIn, pageHeightIn } = buildPrintHtml({ ...book, trimSize }, printOptions);
    const pdf = await renderPrintPdf(html, pageWidthIn, pageHeightIn);

    const safeFilename = safeBookFilename(book.title);
    const trimSuffix = trimSize.replace("x", "-");

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeFilename}-${trimSuffix}.pdf"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (error) {
    // A failure here used to come back as Next.js's generic error page --
    // which downloads (thanks to the <a download> button) looking like a
    // blank/garbled "pdf" with no clue what went wrong. Surface the real
    // cause instead: this is temporary-but-permanent instrumentation for a
    // pipeline that can not be smoke-tested locally (see project memory) --
    // keep it rather than removing it once things are working, since a
    // future Vercel-only failure here would otherwise be just as invisible.
    console.error("PDF export failed for project", projectId, error);
    // The full stack used to be included in this JSON response too, as
    // temporary instrumentation for a pipeline that can't be smoke-tested
    // locally (see project memory) -- but that means anyone who can call
    // this route (i.e. the project's own owner, per loadBookForExport's
    // auth check) gets a server stack trace back, which can leak internal
    // file paths/structure for no real benefit once a bug is fixed.
    // console.error above still captures the full error for us to debug;
    // the client only ever needs the message.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "PDF export failed", message }, { status: 500 });
  }
}
