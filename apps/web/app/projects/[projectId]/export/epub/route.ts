// Downloads a real .epub file for a book. A route handler (not a server
// action) because a server action can't stream an arbitrary binary file
// back as a download -- this is a plain GET the Export button links to.
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@author-app/database";
import { buildEpub, type EpubChapter, type EpubSection } from "@author-app/formatting-engine";
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

function toEpubChapter(node: TreeNode): EpubChapter {
  return {
    id: node.id,
    title: node.title || "Chapter",
    scenes: node.children
      .filter((child) => child.type === "SCENE" && child.scene)
      .map((child) => ({ id: child.id, content: child.scene!.content })),
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
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
            .map((chapterNode) => toEpubChapter(chapterNode)),
        },
      };
    }
    return { kind: "chapter" as const, chapter: toEpubChapter(root) };
  });

  const epub = await buildEpub({
    title: project.title || "Untitled",
    author: authorProfile?.displayName || user.email || "Unknown Author",
    identifier: `urn:author-app:${project.id}`,
    sections,
  });

  const safeFilename =
    (project.title || "book").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "book";

  return new NextResponse(new Uint8Array(epub), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${safeFilename}.epub"`,
      "Content-Length": String(epub.length),
    },
  });
}
