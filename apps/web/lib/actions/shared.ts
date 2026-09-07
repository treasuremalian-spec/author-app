// Small helpers shared by every server-action file in lib/actions -- who's
// logged in, and do they actually own the project they're trying to touch.
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@author-app/database";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

export async function assertProjectOwnership(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found.");
}

// --- Child-resource scoping ------------------------------------------------
//
// assertProjectOwnership() above only proves the CALLER owns `projectId` --
// it says nothing about whether some OTHER client-supplied id (a nodeId,
// sceneId, characterId, etc.) actually belongs to that project. A function
// that checks assertProjectOwnership(projectId, user.id) and then acts on
// `where: { id: someOtherId }` alone is vulnerable: a signed-in user always
// owns at least one project of their own, so they can pass THEIR OWN valid
// projectId alongside ANY OTHER user's nodeId/sceneId/characterId and the
// ownership check passes while the actual write/read lands on a stranger's
// data. There is no database-level backstop for this (Postgres RLS is not
// enabled on any of these tables -- only Supabase Storage buckets have RLS
// policies -- so every one of these tables is protected ENTIRELY by
// application code). Found and fixed across manuscript.ts, scene-save.ts,
// overview.ts, and story-bible.ts on 2026-09-07 as part of a privacy/
// security pass Tasia asked for; see engineering_notes.md. Any NEW
// function that takes a child id alongside a projectId must use one of
// these (or the equivalent updateMany/deleteMany-with-compound-where
// pattern already used in notifications.ts/friends.ts) -- never
// `where: { id: childId }` alone next to a separate ownership check.

/** Throws unless `nodeId` is actually a ManuscriptNode belonging to `projectId`. */
export async function assertNodeInProject(nodeId: string, projectId: string) {
  const node = await prisma.manuscriptNode.findFirst({
    where: { id: nodeId, projectId },
    select: { id: true },
  });
  if (!node) throw new Error("That item isn't part of this project.");
}

/** Throws unless `sceneId` is actually a Scene belonging to `projectId` --
 * Scene has no projectId column of its own (only a 1:1 nodeId), so this
 * goes through its parent ManuscriptNode. */
export async function assertSceneInProject(sceneId: string, projectId: string) {
  const scene = await prisma.scene.findFirst({
    where: { id: sceneId, node: { projectId } },
    select: { id: true },
  });
  if (!scene) throw new Error("That scene isn't part of this project.");
}
