"use server";

// Server-side support for the "Format & Export" project tab
// (components/format/FormatWorkspace.tsx) -- everything here is either (a)
// light, fast data for the LIVE PREVIEW pane, or (b) hands off to the real
// export pipelines in @author-app/formatting-engine (EPUB/PDF/DOCX),
// exactly like the export Route Handlers already do via
// lib/export-data.ts. Kept separate from export-data.ts because the
// preview's needs are deliberately much lighter than a real export: it
// does NOT fetch image bytes (the browser can just hit the image's own
// public Supabase URL directly -- unlike a PDF renderer or an EPUB zip,
// a live browser preview has somewhere else to point <img src> at), and
// it only renders the book's first chapter with real content rather than
// the whole manuscript, so opening the tab on a full-length novel stays
// fast.

import { prisma } from "@author-app/database";
import { sceneContentToXhtml, isSceneContentEmpty, docHasSpreadImage, type RenderContext } from "@author-app/formatting-engine";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";
import { buildTree, type ManuscriptNodeData } from "@/lib/manuscript-tree";

type NodeWithScene = {
  id: string;
  projectId: string;
  parentId: string | null;
  type: "PART" | "CHAPTER" | "SCENE";
  title: string;
  orderIndex: number;
  scene: { id: string; content: unknown } | null;
};

export interface FormatPreviewData {
  title: string;
  author: string;
  chapterTitle: string;
  /** Pre-rendered XHTML of the first chapter that actually has content --
   * image src attributes are left as their real Supabase Storage public
   * URLs (see the file comment above), so the browser fetches them
   * directly rather than this needing to embed any bytes. */
  chapterHtml: string;
  /** Whether ANY scene anywhere in the book has a full-spread image --
   * shown as a small "this book will print with real bleed" note next to
   * the print options, since it changes the physical page size of every
   * exported PDF page, not just the ones with an image on them (see
   * BLEED_IN in print-html.ts). */
  hasSpreadImage: boolean;
}

const PASSTHROUGH_IMAGE_CTX: RenderContext = { resolveImage: (src) => src };

/** Light data for the Format tab's live preview pane -- the book's
 * title/author plus the first chapter (by manuscript order) that actually
 * has written content, rendered the same way export renders it (so the
 * preview's typography genuinely reflects what tiptap-to-xhtml.ts
 * produces) but skipping the image-byte-fetching work loadBookForExport
 * does for a real export. */
export async function getFormatPreviewData(projectId: string): Promise<FormatPreviewData> {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const [project, authorProfile, nodes] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId } }),
    prisma.authorProfile.findUnique({ where: { userId: user.id } }),
    prisma.manuscriptNode.findMany({
      where: { projectId },
      orderBy: { orderIndex: "asc" },
      include: { scene: true },
    }),
  ]);

  const treeNodes: ManuscriptNodeData[] = (nodes as NodeWithScene[]).map((n) => ({
    id: n.id,
    projectId: n.projectId,
    parentId: n.parentId,
    type: n.type,
    title: n.title,
    orderIndex: n.orderIndex,
    scene: n.scene
      ? {
          id: n.scene.id,
          content: n.scene.content,
          wordCount: 0,
          povCharacterId: null,
          locationId: null,
          storyDate: null,
          status: "PLANNED",
          purpose: null,
          plotline: null,
          notes: null,
          targetWordCount: null,
          characterIds: [],
        }
      : null,
  }));

  const roots = buildTree(treeNodes);

  // Flatten to CHAPTER nodes in reading order, regardless of whether
  // they're nested under a PART -- the preview doesn't need to render
  // part dividers, just find the first chapter with real prose.
  const chapters: typeof roots = [];
  for (const root of roots) {
    if (root.type === "CHAPTER") chapters.push(root);
    else if (root.type === "PART") {
      for (const child of root.children) {
        if (child.type === "CHAPTER") chapters.push(child);
      }
    }
  }

  let hasSpreadImage = false;
  for (const chapter of chapters) {
    for (const sceneNode of chapter.children) {
      if (sceneNode.scene && docHasSpreadImage(sceneNode.scene.content)) hasSpreadImage = true;
    }
  }

  const previewChapter =
    chapters.find((c) => c.children.some((s) => s.scene && !isSceneContentEmpty(s.scene.content))) ?? chapters[0];

  let chapterHtml = "";
  let chapterTitle = previewChapter?.title || "Chapter One";
  if (previewChapter) {
    const sceneHtmls = previewChapter.children
      .filter((s) => s.scene && !isSceneContentEmpty(s.scene.content))
      // Cap to the first two scenes -- plenty to show the formatting
      // options' effect without rendering an entire chapter (or book) into
      // a client-side preview pane on every options change.
      .slice(0, 2)
      .map((s) => sceneContentToXhtml(s.scene!.content, PASSTHROUGH_IMAGE_CTX));
    chapterHtml = sceneHtmls.join('\n<p class="scene-break">⁂</p>\n');
  }
  if (!chapterHtml.trim()) {
    chapterHtml =
      "<p>Start writing to see your book take shape here -- this preview mirrors your first chapter as you format it.</p>";
    chapterTitle = chapterTitle || "Chapter One";
  }

  return {
    title: project.title || "Untitled",
    author: authorProfile?.displayName || user.email || "Unknown Author",
    chapterTitle: chapterTitle || "Chapter One",
    chapterHtml,
    hasSpreadImage,
  };
}
