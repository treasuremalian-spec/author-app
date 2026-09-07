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
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json({ error: "DOCX export failed", message, stack }, { status: 500 });
  }
}
