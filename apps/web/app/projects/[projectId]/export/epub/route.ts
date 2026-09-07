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
    // The full stack used to be included in this JSON response too, as
    // temporary instrumentation for a pipeline that can't be smoke-tested
    // locally (see project memory) -- but that means anyone who can call
    // this route (i.e. the project's own owner, per loadBookForExport's
    // auth check) gets a server stack trace back, which can leak internal
    // file paths/structure for no real benefit once a bug is fixed.
    // console.error above still captures the full error for us to debug;
    // the client only ever needs the message.
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: "EPUB export failed", message }, { status: 500 });
  }
}
