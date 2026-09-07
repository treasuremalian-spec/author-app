// Downloads a real .docx file in Standard Manuscript Format -- a plain
// GET Route Handler, matching the existing EPUB/PDF export routes (a
// server action can't stream an arbitrary binary file back as a
// download). See packages/formatting-engine/build-docx.ts for the actual
// document-building logic and why this format deliberately looks nothing
// like the styled PDF/EPUB exports.
import { NextRequest, NextResponse } from "next/server";
import { buildManuscriptDocx } from "@author-app/formatting-engine";
import { loadBookForExport, safeBookFilename } from "@/lib/export-data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const book = await loadBookForExport(projectId);
    const docxBuffer = await buildManuscriptDocx(book);
    const safeFilename = safeBookFilename(book.title);

    return new NextResponse(new Uint8Array(docxBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safeFilename}-manuscript.docx"`,
        "Content-Length": String(docxBuffer.length),
      },
    });
  } catch (error) {
    console.error("DOCX export failed for project", projectId, error);
    // The full stack used to be included in this JSON response too, as
    // temporary instrumentation for a pipeline that can't be smoke-tested
    // locally (see project memory) -- but that means anyone who can call
    // this route (i.e. the project's own owner, per loadBookForExport's
    // auth check) gets a server stack trace back, which can leak internal
    // file paths/structure for no real benefit once a bug is fixed.
    // console.error above still captures the full error for us to debug;
    // the client only ever needs the message.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "DOCX export failed", message }, { status: 500 });
  }
}
