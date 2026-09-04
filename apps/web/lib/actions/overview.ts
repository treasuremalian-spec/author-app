"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";

// ---------------------------------------------------------------------------
// Book details -- synopsis, tropes, POV & tense, deadline, release date,
// playlist link, and the target word count that already existed on Project.
// ---------------------------------------------------------------------------

export interface ProjectDetails {
  id: string;
  title: string;
  synopsis: string | null;
  tropes: string[];
  povAndTense: string | null;
  deadline: Date | null;
  releaseDate: Date | null;
  playlistUrl: string | null;
  targetWordCount: number | null;
  currentWordCount: number;
}

export async function getProjectOverview(projectId: string): Promise<ProjectDetails> {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const agg = await prisma.scene.aggregate({
    where: { node: { projectId } },
    _sum: { wordCount: true },
  });

  return {
    id: project.id,
    title: project.title,
    synopsis: project.synopsis,
    tropes: project.tropes,
    povAndTense: project.povAndTense,
    deadline: project.deadline,
    releaseDate: project.releaseDate,
    playlistUrl: project.playlistUrl,
    targetWordCount: project.targetWordCount,
    currentWordCount: agg._sum.wordCount ?? 0,
  };
}

export interface ProjectDetailsUpdate {
  synopsis?: string | null;
  tropes?: string[];
  povAndTense?: string | null;
  deadline?: Date | null;
  releaseDate?: Date | null;
  playlistUrl?: string | null;
  targetWordCount?: number | null;
}

export async function updateProjectDetails(
  projectId: string,
  data: ProjectDetailsUpdate
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.project.update({ where: { id: projectId }, data });
  revalidatePath(`/projects/${projectId}/overview`);
}

// ---------------------------------------------------------------------------
// Action items -- a lightweight per-book to-do board
// ---------------------------------------------------------------------------

export type ActionItemStatus =
  | "NO_STATUS"
  | "IN_PROGRESS"
  | "COMPLETED"
  | "BACKBURNER"
  | "STUCK";

export interface ActionItemRow {
  id: string;
  title: string;
  status: ActionItemStatus;
  notes: string | null;
  orderIndex: number;
}

export async function listActionItems(projectId: string): Promise<ActionItemRow[]> {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const items = await prisma.actionItem.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
  });
  return items as unknown as ActionItemRow[];
}

export async function createActionItem(projectId: string, title: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const count = await prisma.actionItem.count({ where: { projectId, status: "NO_STATUS" } });

  const item = await prisma.actionItem.create({
    data: { projectId, title: title.trim() || "New item", orderIndex: count },
  });
  return item as unknown as ActionItemRow;
}

export async function updateActionItem(
  itemId: string,
  projectId: string,
  data: { title?: string; notes?: string | null }
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.actionItem.update({ where: { id: itemId }, data });
}

export async function deleteActionItem(itemId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.actionItem.delete({ where: { id: itemId } });
}

export async function reorderActionItems(
  projectId: string,
  updates: { id: string; status: ActionItemStatus; orderIndex: number }[]
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.$transaction(
    updates.map((u) =>
      prisma.actionItem.update({
        where: { id: u.id },
        data: { status: u.status, orderIndex: u.orderIndex },
      })
    )
  );
}
