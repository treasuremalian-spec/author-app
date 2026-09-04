"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export async function listCharacters(projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  return prisma.character.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });
}

export async function createCharacter(projectId: string, name: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  return prisma.character.create({
    data: { projectId, name: name.trim() || "New character" },
  });
}

export interface CharacterUpdateData {
  name?: string;
  nickname?: string | null;
  photoUrl?: string | null;
  age?: string | null;
  birthday?: string | null;
  appearance?: string | null;
  personality?: string | null;
  occupation?: string | null;
  family?: string | null;
  backstory?: string | null;
  goals?: string | null;
  motivation?: string | null;
  fears?: string | null;
  secrets?: string | null;
  likesDislikes?: string | null;
  arc?: string | null;
  dialogueStyle?: string | null;
  notes?: string | null;
}

export async function updateCharacter(
  characterId: string,
  projectId: string,
  data: CharacterUpdateData
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.character.update({ where: { id: characterId }, data });
  revalidatePath(`/projects/${projectId}/story-bible`);
}

export async function deleteCharacter(characterId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.character.delete({ where: { id: characterId } });
  revalidatePath(`/projects/${projectId}/story-bible`);
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export async function listLocations(projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  return prisma.location.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });
}

export async function createLocation(projectId: string, name: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  return prisma.location.create({
    data: { projectId, name: name.trim() || "New location" },
  });
}

export interface LocationUpdateData {
  name?: string;
  description?: string | null;
  notes?: string | null;
}

export async function updateLocation(
  locationId: string,
  projectId: string,
  data: LocationUpdateData
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.location.update({ where: { id: locationId }, data });
  revalidatePath(`/projects/${projectId}/story-bible`);
}

export async function deleteLocation(locationId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.location.delete({ where: { id: locationId } });
  revalidatePath(`/projects/${projectId}/story-bible`);
}

// ---------------------------------------------------------------------------
// Story notes (the flexible worldbuilding / rules / research catch-all)
// ---------------------------------------------------------------------------

export type StoryBibleEntryTypeValue =
  | "WORLDBUILDING"
  | "ORGANIZATION"
  | "FAMILY"
  | "BUSINESS"
  | "OBJECT"
  | "TERMINOLOGY"
  | "RULE"
  | "HISTORICAL_EVENT"
  | "RESEARCH"
  | "FACT";

export interface StoryBibleEntryRow {
  id: string;
  type: StoryBibleEntryTypeValue;
  title: string;
  body: string | null;
}

export async function listStoryBibleEntries(projectId: string): Promise<StoryBibleEntryRow[]> {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const entries = await prisma.storyBibleEntry.findMany({
    where: {
      projectId,
      type: {
        in: [
          "WORLDBUILDING",
          "ORGANIZATION",
          "FAMILY",
          "BUSINESS",
          "OBJECT",
          "TERMINOLOGY",
          "RULE",
          "HISTORICAL_EVENT",
          "RESEARCH",
          "FACT",
        ],
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  // The query above already guarantees `type` is one of the ten project-note
  // categories -- Prisma's generated type doesn't know that, so we narrow it
  // here once instead of every caller having to.
  return entries as unknown as StoryBibleEntryRow[];
}

export async function createStoryBibleEntry(
  projectId: string,
  type: StoryBibleEntryTypeValue,
  title: string
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  return prisma.storyBibleEntry.create({
    data: { projectId, type, title: title.trim() || "New note" },
  });
}

export async function updateStoryBibleEntry(
  entryId: string,
  projectId: string,
  data: { title?: string; body?: string | null; type?: StoryBibleEntryTypeValue }
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.storyBibleEntry.update({ where: { id: entryId }, data });
  revalidatePath(`/projects/${projectId}/story-bible`);
}

export async function deleteStoryBibleEntry(entryId: string, projectId: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.storyBibleEntry.delete({ where: { id: entryId } });
  revalidatePath(`/projects/${projectId}/story-bible`);
}
