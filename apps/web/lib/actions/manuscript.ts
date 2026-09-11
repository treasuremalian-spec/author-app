"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { EMPTY_DOC } from "@/lib/wordcount";
import { requireUser, assertProjectOwnership, assertNodeInProject, assertSceneInProject } from "@/lib/actions/shared";

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

  // Which SCENE node was actually written in most recently, so the editor
  // can default-open there instead of always the first scene in tree
  // order -- "continue where you left off," for both a direct project
  // open and the library's "Continue writing" link. `nodes` already has
  // each scene's `updatedAt` loaded via `include: { scene: true }` above,
  // so this is a plain in-memory reduce, no extra query. Null when the
  // book has no scenes with any content yet.
  let lastEditedNodeId: string | null = null;
  let lastEditedAt: Date | null = null;
  for (const n of nodes) {
    if (!n.scene) continue;
    if (!lastEditedAt || n.scene.updatedAt > lastEditedAt) {
      lastEditedNodeId = n.id;
      lastEditedAt = n.scene.updatedAt;
    }
  }

  return { project, nodes, characters, lastEditedNodeId };
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
  await assertNodeInProject(nodeId, projectId);

  const trimmed = title.trim();
  if (!trimmed) throw new Error("Title can't be empty.");

  await prisma.manuscriptNode.update({
    where: { id: nodeId },
    data: { title: trimmed },
  });

  revalidatePath(`/projects/${projectId}`);
}

// ---------------------------------------------------------------------------
// Per-chapter "Convert To" page type + related formatting options
// (2026-09-11, Phase 16)
// ---------------------------------------------------------------------------

export async function convertNodePageType(
  nodeId: string,
  projectId: string,
  pageType:
    | "CHAPTER"
    | "BLURBS"
    | "COPYRIGHT"
    | "DEDICATION"
    | "EPIGRAPH"
    | "FOREWORD"
    | "INTRODUCTION"
    | "PREFACE"
    | "PROLOGUE"
    | "EPILOGUE"
    | "AFTERWORD"
    | "BIBLIOGRAPHY"
    | "ACKNOWLEDGMENTS"
    | "ABOUT_THE_AUTHOR"
    | "ALSO_BY"
    | "UNCATEGORIZED"
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertNodeInProject(nodeId, projectId);

  await prisma.manuscriptNode.update({
    where: { id: nodeId },
    data: { pageType },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function updateNodeFormatting(
  nodeId: string,
  projectId: string,
  patch: {
    numbered?: boolean;
    chapterAuthor?: string | null;
    showHeadingOverride?: boolean | null;
  }
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertNodeInProject(nodeId, projectId);

  await prisma.manuscriptNode.update({
    where: { id: nodeId },
    data: patch,
  });

  revalidatePath(`/projects/${projectId}`);
}

// "Clear Title" -- a one-time action, not a persistent flag: it just
// empties the stored title so the node falls back to its page type's
// default heading (see chapterHeadingLabel() in the formatting-engine
// package), the exact same fallback an always-blank title already gets.
// Kept separate from renameNode(), which deliberately rejects an empty
// string (a blank rename-on-blur means "I didn't mean to clear this",
// per Binder.tsx's commitRename()) -- this is the explicit, unambiguous
// version of that same action.
export async function clearNodeTitle(nodeId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertNodeInProject(nodeId, projectId);

  await prisma.manuscriptNode.update({
    where: { id: nodeId },
    data: { title: "" },
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function deleteNode(nodeId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertNodeInProject(nodeId, projectId);

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

  // assertProjectOwnership only proves the CALLER owns `projectId` -- it
  // says nothing about whether every node in this batch (or the parent
  // it's being moved under) actually belongs to that project. Without
  // this, a signed-in user could reorder/reparent an arbitrary OTHER
  // user's manuscript nodes just by including their id in a batch sent
  // alongside a projectId the caller genuinely owns.
  const touchedIds = new Set<string>();
  for (const u of updates) {
    touchedIds.add(u.id);
    if (u.parentId) touchedIds.add(u.parentId);
  }
  const ownedCount = await prisma.manuscriptNode.count({
    where: { id: { in: Array.from(touchedIds) }, projectId },
  });
  if (ownedCount !== touchedIds.size) {
    throw new Error("One or more of those items aren't part of this project.");
  }

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

// Scene content saving (autosave) used to be a Server Action here. It
// moved to a plain Route Handler -- POST /api/scenes/[sceneId]/save,
// backed by lib/scene-save.ts -- after Server Actions hit two real,
// hard-to-diagnose framework issues in a row for this specific call
// shape (production error redaction to a useless "Minified React error
// #441", then a "temporary client reference" crash on the returned
// result). See scene-save.ts for the full explanation.

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
  await assertSceneInProject(sceneId, projectId);

  await prisma.scene.update({
    where: { id: sceneId },
    data,
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function listSceneVersions(sceneId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertSceneInProject(sceneId, projectId);

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
  await assertSceneInProject(sceneId, projectId);

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
      // _max: { updatedAt } piggybacks on the same aggregate query as the
      // word-count sum -- Scene.updatedAt is already maintained for free by
      // Prisma's @updatedAt on every autosave, so this is a real "last
      // actually wrote something here" signal (unlike Project.updatedAt,
      // which only moves when the project ROW itself changes -- title,
      // status, etc. -- never on a scene autosave) at no extra query cost.
      // Powers the library's "last edited" sort and its "continue writing"
      // callout. Null when the book has no scenes yet (a brand-new, still-
      // empty project).
      const agg = await prisma.scene.aggregate({
        where: { node: { projectId: project.id } },
        _sum: { wordCount: true },
        _max: { updatedAt: true },
      });
      return {
        ...project,
        currentWordCount: agg._sum.wordCount ?? 0,
        lastActivityAt: agg._max.updatedAt ?? null,
      };
    })
  );

  return withStats;
}

// ---------------------------------------------------------------------------
// Lightweight project info, shared by every tab in the project workspace
// ---------------------------------------------------------------------------

export async function getProjectMeta(projectId: string) {
  const user = await requireUser();

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: user.id },
    select: { id: true, title: true },
  });
  if (!project) redirect("/library");

  return project;
}
