"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@author-app/database";
import { countWords, EMPTY_DOC } from "@/lib/wordcount";

// How long we let sit between autosave calls before we also stash a
// restorable snapshot -- frequent enough that undo history is meaningful,
// rare enough that we're not writing hundreds of snapshots a day.
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

async function assertProjectOwnership(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found.");
}

function defaultTitle(type: "PART" | "CHAPTER" | "SCENE") {
  if (type === "PART") return "New Part";
  if (type === "CHAPTER") return "New Chapter";
  return "New Scene";
}

// ---------------------------------------------------------------------------
// Library (book list)
// ---------------------------------------------------------------------------

export async function listProjects() {
  const user = await requireUser();
  return prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createProject(formData: FormData) {
  const user = await requireUser();

  const title = String(formData.get("title") || "").trim();
  const targetWordCountRaw = String(formData.get("targetWordCount") || "").trim();
  const genresRaw = String(formData.get("genres") || "").trim();

  if (!title) {
    redirect(`/library?error=${encodeURIComponent("Give your book a title first.")}`);
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      title,
      targetWordCount: targetWordCountRaw ? parseInt(targetWordCountRaw, 10) || null : null,
      genres: genresRaw
        ? genresRaw.split(",").map((g) => g.trim()).filter(Boolean)
        : [],
    },
  });

  redirect(`/projects/${project.id}`);
}

// ---------------------------------------------------------------------------
// Project workspace: tree + scenes
// ---------------------------------------------------------------------------

export async function getProjectData(projectId: string) {
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
  });
  if (!project) redirect("/library");

  const nodes = await prisma.manuscriptNode.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
    include: { scene: true },
  });

  const characters = await prisma.character.findMany({
    where: { projectId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return { project, nodes, characters };
}

export async function createNode(input: {
  projectId: string;
  parentId: string | null;
  type: "PART" | "CHAPTER" | "SCENE";
  title?: string;
}) {
  const user = await requireUser();
  await assertProjectOwnership(input.projectId, user.id);

  const siblingCount = await prisma.manuscriptNode.count({
    where: { projectId: input.projectId, parentId: input.parentId },
  });

  const node = await prisma.manuscriptNode.create({
    data: {
      projectId: input.projectId,
      parentId: input.parentId,
      type: input.type,
      title: input.title?.trim() || defaultTitle(input.type),
      orderIndex: siblingCount,
    },
  });

  if (input.type === "SCENE") {
    await prisma.scene.create({
      data: { nodeId: node.id, content: EMPTY_DOC },
    });
  }

  revalidatePath(`/projects/${input.projectId}`);

  const scene =
    input.type === "SCENE"
      ? await prisma.scene.findUnique({ where: { nodeId: node.id } })
      : null;

  return { ...node, scene };
}

export async function renameNode(nodeId: string, projectId: string, title: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title can't be empty.");

  await prisma.manuscriptNode.update({
    where: { id: nodeId },
    data: { title: trimmed },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteNode(nodeId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  // Cascade deletes children + any scene beneath them (defined at the DB level).
  await prisma.manuscriptNode.delete({ where: { id: nodeId } });

  revalidatePath(`/projects/${projectId}`);
}

export async function reorderNodes(
  projectId: string,
  updates: { id: string; parentId: string | null; orderIndex: number }[]
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.$transaction(
    updates.map((u) =>
      prisma.manuscriptNode.update({
        where: { id: u.id },
        data: { parentId: u.parentId, orderIndex: u.orderIndex },
      })
    )
  );

  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Scene content: autosave, metadata, version history
// ---------------------------------------------------------------------------

export async function saveSceneContent(
  sceneId: string,
  projectId: string,
  content: unknown
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const wordCount = countWords(content);

  const latestVersion = await prisma.sceneVersion.findFirst({
    where: { sceneId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const needsSnapshot =
    !latestVersion ||
    Date.now() - latestVersion.createdAt.getTime() > SNAPSHOT_INTERVAL_MS;

  await prisma.$transaction([
    prisma.scene.update({
      where: { id: sceneId },
      data: { content: content as object, wordCount },
    }),
    ...(needsSnapshot
      ? [
          prisma.sceneVersion.create({
            data: { sceneId, content: content as object, wordCount, savedById: user.id },
          }),
        ]
      : []),
  ]);

  return { wordCount };
}

export async function updateSceneMeta(
  sceneId: string,
  projectId: string,
  data: {
    status?: "PLANNED" | "DRAFTING" | "WRITTEN" | "REVISING" | "COMPLETE";
    povCharacterId?: string | null;
    targetWordCount?: number | null;
    notes?: string | null;
  }
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.scene.update({
    where: { id: sceneId },
    data,
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function listSceneVersions(sceneId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  return prisma.sceneVersion.findMany({
    where: { sceneId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
}

export async function restoreSceneVersion(
  sceneId: string,
  versionId: string,
  projectId: string
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const version = await prisma.sceneVersion.findUnique({ where: { id: versionId } });
  if (!version || version.sceneId !== sceneId) throw new Error("Version not found.");

  const current = await prisma.scene.findUnique({ where: { id: sceneId } });
  if (!current) throw new Error("Scene not found.");

  await prisma.$transaction([
    // Snapshot whatever's on the page right now, so restoring never loses work.
    prisma.sceneVersion.create({
      data: {
        sceneId,
        content: current.content as object,
        wordCount: current.wordCount,
        savedById: user.id,
      },
    }),
    prisma.scene.update({
      where: { id: sceneId },
      data: { content: version.content as object, wordCount: version.wordCount },
    }),
  ]);

  revalidatePath(`/projects/${projectId}`);
  return { content: version.content, wordCount: version.wordCount };
}

// ---------------------------------------------------------------------------
// Library stats (word count progress per book, for the shelf view)
// ---------------------------------------------------------------------------

export async function listProjectsWithStats() {
  const user = await requireUser();

  const projects = await prisma.project.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
  });

  const withStats = await Promise.all(
    projects.map(async (project) => {
      const agg = await prisma.scene.aggregate({
        where: { node: { projectId: project.id } },
        _sum: { wordCount: true },
      });
      return { ...project, currentWordCount: agg._sum.wordCount ?? 0 };
    })
  );

  return withStats;
}
