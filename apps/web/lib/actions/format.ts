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
// a live browser preview has somewhere else to point <img src> at).
//
// Renders EVERY chapter (2026-09-07, per author request: "ability to
// scroll the entire book in the preview" -- previously this only rendered
// the book's first chapter with content, and FormatPreview.tsx showed a
// single fixed, unscrollable page). Still fast even for a full-length
// novel: this is the same synchronous JSON-tree walk sceneContentToXhtml
// always did, just run once per scene across the whole book instead of
// stopping after the first chapter's first two -- no network calls, no
// headless-browser rendering (that's what the real PDF export pipeline is
// for).

import { prisma } from "@author-app/database";
import { sceneContentToXhtml, isSceneContentEmpty, docHasSpreadImage, type RenderContext } from "@author-app/formatting-engine";
import { chapterHeadingLabel } from "@author-app/formatting-engine/page-types";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";
import { buildTree, type ManuscriptNodeData } from "@/lib/manuscript-tree";

type NodeWithScene = {
  id: string;
  projectId: string;
  parentId: string | null;
  type: "PART" | "CHAPTER" | "SCENE";
  title: string;
  orderIndex: number;
  pageType: ManuscriptNodeData["pageType"];
  numbered: boolean;
  chapterAuthor: string | null;
  showHeadingOverride: boolean | null;
  scene: { id: string; content: unknown } | null;
};

export interface FormatPreviewChapter {
  title: string;
  /** null = follow the book-wide "show chapter titles" print option;
   * true/false = this chapter's own "Show Heading in Book" override. */
  showHeadingOverride: boolean | null;
  /** "Add Chapter Author" byline, if set. */
  chapterAuthor: string | null;
  /** Pre-rendered XHTML of this chapter's non-empty scenes -- image src
   * attributes are left as their real Supabase Storage public URLs (see
   * the file comment above), so the browser fetches them directly rather
   * than this needing to embed any bytes. */
  html: string;
}

export interface FormatPreviewData {
  title: string;
  author: string;
  /** Every chapter in the book, in reading order -- the preview pane
   * scrolls through all of them (see the file comment above), not just
   * the opening. */
  chapters: FormatPreviewChapter[];
  /** Whether ANY scene anywhere in the book has a full-spread image --
   * shown as a small "this book will print with real bleed" note next to
   * the print options, since it changes the physical page size of every
   * exported PDF page, not just the ones with an image on them (see
   * BLEED_IN in print-html.ts). */
  hasSpreadImage: boolean;
  /** The book-wide background image for the print PDF's "behind the
   * text" option (author request, 2026-09-07), if one has been uploaded --
   * lets FormatWorkspace seed BackgroundImageUploadButton without a
   * second fetch. Print-only; the live preview and EPUB never use this
   * for anything but the small upload-button thumbnail. */
  backgroundImageUrl: string | null;
}

const PASSTHROUGH_IMAGE_CTX: RenderContext = { resolveImage: (src) => src };

/** Light data for the Format tab's live preview pane -- the book's
 * title/author plus every chapter, rendered the same way export renders
 * it (so the preview's typography genuinely reflects what
 * tiptap-to-xhtml.ts produces) but skipping the image-byte-fetching work
 * loadBookForExport does for a real export. */
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
    pageType: n.pageType,
    numbered: n.numbered,
    chapterAuthor: n.chapterAuthor,
    showHeadingOverride: n.showHeadingOverride,
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
  // they're nested under a PART -- the preview doesn't render part
  // dividers as their own page, just the chapters in sequence.
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

  // Mirrors the real export renderers' chapter-numbering rule exactly
  // (see chapterHeadingLabel() in page-types.ts): only a plain, unconverted
  // Chapter node advances the auto-number, so a front-/back-matter page
  // sitting between two chapters doesn't shift the numbers that follow it.
  let previewChapterNumber = 0;
  const previewChapters: FormatPreviewChapter[] = chapters.map((chapter) => {
    if (chapter.pageType === "CHAPTER") previewChapterNumber += 1;
    const sceneHtmls = chapter.children
      .filter((s) => s.scene && !isSceneContentEmpty(s.scene.content))
      .map((s) => sceneContentToXhtml(s.scene!.content, PASSTHROUGH_IMAGE_CTX));
    return {
      title: chapterHeadingLabel({
        pageType: chapter.pageType,
        title: chapter.title,
        numbered: chapter.numbered,
        chapterNumber: previewChapterNumber,
      }),
      showHeadingOverride: chapter.showHeadingOverride,
      chapterAuthor: chapter.chapterAuthor,
      html: sceneHtmls.join('\n<p class="scene-break">⁂</p>\n'),
    };
  });

  // A brand-new project (no chapters yet, or every chapter still blank)
  // gets one friendly placeholder entry instead of a scrollable stack of
  // empty headings.
  if (!previewChapters.some((c) => c.html.trim())) {
    previewChapters.splice(0, previewChapters.length, {
      title: previewChapters[0]?.title || "Chapter 1",
      showHeadingOverride: null,
      chapterAuthor: null,
      html: "<p>Start writing to see your book take shape here -- this preview mirrors your manuscript as you format it.</p>",
    });
  }

  return {
    title: project.title || "Untitled",
    author: authorProfile?.displayName || user.email || "Unknown Author",
    chapters: previewChapters,
    hasSpreadImage,
    backgroundImageUrl: project.backgroundImageUrl,
  };
}
