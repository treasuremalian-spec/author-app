// Downloads a real .epub file for a book. A route handler (not a server
// action) because a server action can't stream an arbitrary binary file
// back as a download -- this is a plain GET the Export button links to.
import { NextRequest, NextResponse } from "next/server";
import { buildEpub } from "@author-app/formatting-engine";
import { loadBookForExport, safeBookFilename } from "@/lib/export-data";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  try {
    const book = await loadBookForExport(projectId);

    // Temporary diagnostic: visiting .../export/epub?debug=1 returns a
    // JSON summary of exactly what got loaded (chapter/scene counts and a
    // snippet of the first scene's raw content) instead of building the
    // file -- added while tracking down a real bug where the EPUB
    // downloads fine but is missing the manuscript's actual prose. Remove
    // once that's confirmed fixed.
    if (request.nextUrl.searchParams.get("debug") === "1") {
      const summary = book.sections.map((section) => {
        if (section.kind === "part") {
          return {
            kind: "part",
            title: section.part.title,
            chapters: section.part.chapters.map((c) => ({
              title: c.title,
              sceneCount: c.scenes.length,
              scenes: c.scenes.map((s) => ({
                id: s.id,
                contentType: typeof s.content,
                contentPreview: JSON.stringify(s.content)?.slice(0, 300),
              })),
            })),
          };
        }
        return {
          kind: "chapter",
          title: section.chapter.title,
          sceneCount: section.chapter.scenes.length,
          scenes: section.chapter.scenes.map((s) => ({
            id: s.id,
            contentType: typeof s.content,
            contentPreview: JSON.stringify(s.content)?.slice(0, 300),
          })),
        };
      });
      return NextResponse.json({ title: book.title, author: book.author, sections: summary });
    }

    const epub = await buildEpub(book);
    const safeFilename = safeBookFilename(book.title);

    return new NextResponse(new Uint8Array(epub), {
      headers: {
        "Content-Type": "application/epub+zip",
        "Content-Disposition": `attachment; filename="${safeFilename}.epub"`,
        "Content-Length": String(epub.length),
      },
    });
  } catch (error) {
    console.error("EPUB export failed for project", projectId, error);
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    return NextResponse.json({ error: "EPUB export failed", message, stack }, { status: 500 });
  }
}
