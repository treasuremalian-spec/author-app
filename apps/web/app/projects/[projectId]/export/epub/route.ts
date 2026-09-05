// Downloads a real .epub file for a book. A route handler (not a server
// action) because a server action can't stream an arbitrary binary file
// back as a download -- this is a plain GET the Export button links to.
import { NextRequest, NextResponse } from "next/server";
import { buildEpub } from "@author-app/formatting-engine";
import { loadBookForExport, safeBookFilename } from "@/lib/export-data";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const book = await loadBookForExport(projectId);

  const epub = await buildEpub(book);
  const safeFilename = safeBookFilename(book.title);

  return new NextResponse(new Uint8Array(epub), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${safeFilename}.epub"`,
      "Content-Length": String(epub.length),
    },
  });
}
