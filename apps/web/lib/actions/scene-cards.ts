"use server";

// Server actions for the Story Bible's "Scene Cards" corkboard
// (2026-09-11): short synopsis/note index cards a writer can drag
// between chapters (mirroring the real manuscript, via listChapters() in
// manuscript.ts) or leave in an "Unassigned" pool, and reorder within a
// chapter. See shared.ts's child-resource-scoping note -- there is no
// database-level RLS on this table, so every function here re-proves
// that whatever id the caller passed in actually belongs to the project
// they proved they own, exactly like every other actions file.

import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import {
  requireUser,
  assertProjectOwnership,
  assertNodeInProject,
  assertSceneCardInProject,
} from "@/lib/actions/shared";

export async function listSceneCards(projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  return prisma.sceneCard.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });
}

export async function createSceneCard(input: {
  projectId: string;
  chapterNodeId: string | null;
  title?: string;
}) {
  const user = await requireUser();
  await assertProjectOwnership(input.projectId, user.id);
  if (input.chapterNodeId) {
    await assertNodeInProject(input.chapterNodeId, input.projectId);
  }

  const siblingCount = await prisma.sceneCard.count({
    where: { projectId: input.projectId, chapterNodeId: input.chapterNodeId },
  });

  const card = await prisma.sceneCard.create({
    data: {
      projectId: input.projectId,
      chapterNodeId: input.chapterNodeId,
      title: input.title?.trim() || "New Scene Card",
      orderIndex: siblingCount,
    },
  });

  revalidatePath(`/projects/${input.projectId}/story-bible`);
  return card;
}

export async function updateSceneCard(
  sceneCardId: string,
  projectId: string,
  patch: { title?: string; synopsis?: string | null; colorTag?: string | null }
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertSceneCardInProject(sceneCardId, projectId);

  await prisma.sceneCard.update({
    where: { id: sceneCardId },
    data: patch,
  });

  revalidatePath(`/projects/${projectId}/story-bible`);
}

// Moves a card to a (possibly different) chapter -- or to the
// "Unassigned" pool when chapterNodeId is null -- landing at orderIndex
// among whatever is already there. Reordering-in-place uses this too
// (same chapterNodeId, new orderIndex); see reorderSceneCards() for the
// batched "several cards changed positions" case a full drag-drop
// re-sort produces.
export async function moveSceneCard(
  sceneCardId: string,
  projectId: string,
  chapterNodeId: string | null,
  orderIndex: number
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertSceneCardInProject(sceneCardId, projectId);
  if (chapterNodeId) {
    await assertNodeInProject(chapterNodeId, projectId);
  }

  await prisma.sceneCard.update({
    where: { id: sceneCardId },
    data: { chapterNodeId, orderIndex },
  });

  revalidatePath(`/projects/${projectId}/story-bible`);
}

// Batched re-sort -- e.g. a drag-drop that reorders every card within a
// chapter section, or within the Unassigned pool. Mirrors
// reorderNodes()'s ownership-check-then-batch pattern in manuscript.ts:
// one count() query proves every touched card belongs to this project
// before any write happens, rather than trusting each id individually.
export async function reorderSceneCards(
  projectId: string,
  updates: { id: string; chapterNodeId: string | null; orderIndex: number }[]
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const ids = updates.map((u) => u.id);
  const ownedCount = await prisma.sceneCard.count({
    where: { id: { in: ids }, projectId },
  });
  if (ownedCount !== ids.length) {
    throw new Error("One or more of those cards aren't part of this project.");
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.sceneCard.update({
        where: { id: u.id },
        data: { chapterNodeId: u.chapterNodeId, orderIndex: u.orderIndex },
      })
    )
  );

  revalidatePath(`/projects/${projectId}/story-bible`);
}

export async function deleteSceneCard(sceneCardId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);
  await assertSceneCardInProject(sceneCardId, projectId);

  await prisma.sceneCard.delete({ where: { id: sceneCardId } });

  revalidatePath(`/projects/${projectId}/story-bible`);
}
