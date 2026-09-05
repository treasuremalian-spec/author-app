// Shared data-loading for both export formats (EPUB and print PDF) --
// pulled out of the individual export routes so the two don't drift on
// how a project's manuscript tree gets turned into the Part/Chapter/Scene
// shape the formatting-engine package expects. Not a "use server" file
// (it's only ever imported by Route Handlers, which are already
// server-only), so it's free to export whatever plain helpers it needs.

import { prisma } from "@author-app/database";
import type { EpubChapter, EpubSection } from "@author-app/formatting-engine";
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

  return {
    title: project.title || "Untitled",
    author: authorProfile?.displayName || user.email || "Unknown Author",
    identifier: `urn:author-app:${project.id}`,
    sections,
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
