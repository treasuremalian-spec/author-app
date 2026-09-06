// Shared data-loading for both export formats (EPUB and print PDF) --
// pulled out of the individual export routes so the two don't drift on
// how a project's manuscript tree gets turned into the Part/Chapter/Scene
// shape the formatting-engine package expects. Not a "use server" file
// (it's only ever imported by Route Handlers, which are already
// server-only), so it's free to export whatever plain helpers it needs.

import { prisma } from "@author-app/database";
import { collectImageUrls, type EpubChapter, type EpubCoverImage, type EpubSection } from "@author-app/formatting-engine";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";
import { buildTree, type ManuscriptNodeData, type TreeNode } from "@/lib/manuscript-tree";

// The local (un-generated) Prisma client types everything as `any`, so this
// shape pins down exactly what we read off each row -- see the "use server"
// / Prisma-stub notes in project memory for why this pattern is used
// throughout the codebase.
type NodeWithScene = {
  id: string;
  projectId: string;
  parentId: string | null;
  type: "PART" | "CHAPTER" | "SCENE";
  title: string;
  orderIndex: number;
  scene: {
    id: string;
    content: unknown;
  } | null;
};

function toChapter(node: TreeNode): EpubChapter {
  return {
    id: node.id,
    title: node.title || "Chapter",
    scenes: node.children
      .filter((child) => child.type === "SCENE" && child.scene)
      .map((child) => ({ id: child.id, content: child.scene!.content })),
  };
}

export interface BookForExport {
  title: string;
  author: string;
  identifier: string;
  sections: EpubSection[];
  cover: EpubCoverImage | null;
  /** Every inline manuscript image referenced anywhere in the book, keyed
   * by its stored Supabase Storage public URL -- pre-fetched here (once,
   * up front, deduped) so buildEpub/buildPrintHtml never need to make a
   * network call of their own. See fetchImageAsset() below; a URL whose
   * fetch failed is simply absent from this map, and the export pipelines
   * already fail soft on a missing entry (the image -- and, since the
   * bugfix in tiptap-to-xhtml.ts, its caption -- is dropped rather than
   * shipping a broken reference). */
  images: Record<string, EpubCoverImage>;
}

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Fetches one image URL's real bytes, for embedding directly into an EPUB/PDF -- a stored URL alone is no use to an e-reader or a headless-browser-rendered PDF, both of which need the actual file. A missing or unreachable image fails soft (returns null) rather than blocking the whole export -- used for both the cover and every inline manuscript image. */
async function fetchImageAsset(url: string): Promise<EpubCoverImage | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
    const extension = MIME_TO_EXTENSION[mimeType] || "jpg";
    return { bytes: new Uint8Array(arrayBuffer), mimeType, extension };
  } catch {
    return null;
  }
}

async function loadCoverImage(coverImageUrl: string | null): Promise<EpubCoverImage | null> {
  if (!coverImageUrl) return null;
  return fetchImageAsset(coverImageUrl);
}

/** Walks every scene in the book's tree collecting inline "manuscriptImage" src URLs (see collectImageUrls()), dedupes them, and fetches each one's real bytes in parallel -- mirroring loadCoverImage's fetch-and-fail-soft pattern, just for however many inline images the writer has inserted rather than exactly one. A URL that fails to fetch is simply left out of the returned map (see the BookForExport.images doc comment for what that means downstream). */
async function loadInlineImages(sections: EpubSection[]): Promise<Record<string, EpubCoverImage>> {
  const urls = new Set<string>();
  for (const section of sections) {
    const chapters = section.kind === "part" ? section.part.chapters : [section.chapter];
    for (const chapter of chapters) {
      for (const scene of chapter.scenes) {
        for (const url of collectImageUrls(scene.content)) {
          urls.add(url);
        }
      }
    }
  }

  const images: Record<string, EpubCoverImage> = {};
  await Promise.all(
    Array.from(urls).map(async (url) => {
      const asset = await fetchImageAsset(url);
      if (asset) images[url] = asset;
    })
  );
  return images;
}

/** Loads a project's manuscript, checks ownership, and shapes it for either export format. */
export async function loadBookForExport(projectId: string): Promise<BookForExport> {
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

  const sections: EpubSection[] = roots.map((root) => {
    if (root.type === "PART") {
      return {
        kind: "part" as const,
        part: {
          id: root.id,
          title: root.title || "Part",
          chapters: root.children
            .filter((child) => child.type === "CHAPTER")
            .map((chapterNode) => toChapter(chapterNode)),
        },
      };
    }
    return { kind: "chapter" as const, chapter: toChapter(root) };
  });

  const [cover, images] = await Promise.all([
    loadCoverImage(project.coverImageUrl),
    loadInlineImages(sections),
  ]);

  return {
    title: project.title || "Untitled",
    author: authorProfile?.displayName || user.email || "Unknown Author",
    identifier: `urn:author-app:${project.id}`,
    sections,
    cover,
    images,
  };
}

/** A filesystem-safe filename base derived from the book's title (no extension). */
export function safeBookFilename(title: string): string {
  return (
    (title || "book")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "book"
  );
}
