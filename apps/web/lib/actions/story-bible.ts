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

// The richer worldbuilding sections (inspired by the "A Whole New World" page
// in Tasia's Notion Writer's Bible template) live inside Location's existing
// `customFields` JSON column rather than as their own migration-requiring
// columns -- one flexible blob keyed by section.
export const LOCATION_WORLDBUILDING_SECTIONS = [
  {
    key: "geography",
    label: "Geography & environment",
    placeholder: "Landmarks, climate, terrain, ecosystems -- what does the physical world look and feel like?",
  },
  {
    key: "historyCulture",
    label: "History & culture",
    placeholder: "Major events, traditions and practices, languages, religion.",
  },
  {
    key: "societyPolitics",
    label: "Society & politics",
    placeholder: "Government, social hierarchy, political factions and entities, laws.",
  },
  {
    key: "economyTechnology",
    label: "Economy & technology",
    placeholder: "Economic systems, tech level, magic systems (if any), major industries.",
  },
  {
    key: "dailyLife",
    label: "Daily life & social customs",
    placeholder: "Everyday routines, housing, food, clothing, entertainment.",
  },
  {
    key: "inspiration",
    label: "Inspiration",
    placeholder: "Reference links, mood, or real places/images this is inspired by.",
  },
] as const;

export type LocationWorldbuildingKey = (typeof LOCATION_WORLDBUILDING_SECTIONS)[number]["key"];
export type LocationWorldbuilding = Partial<Record<LocationWorldbuildingKey, string | null>>;

function parseWorldbuilding(raw: unknown): LocationWorldbuilding {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result: LocationWorldbuilding = {};
  for (const section of LOCATION_WORLDBUILDING_SECTIONS) {
    const value = source[section.key];
    result[section.key] = typeof value === "string" ? value : null;
  }
  return result;
}

export interface LocationRow {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  worldbuilding: LocationWorldbuilding;
}

export async function listLocations(projectId: string): Promise<LocationRow[]> {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const locations = await prisma.location.findMany({
    where: { projectId },
    orderBy: { name: "asc" },
  });

  type LocationRowLike = {
    id: string;
    name: string;
    description: string | null;
    notes: string | null;
    customFields: unknown;
  };

  return (locations as LocationRowLike[]).map((l) => ({
    id: l.id,
    name: l.name,
    description: l.description,
    notes: l.notes,
    worldbuilding: parseWorldbuilding(l.customFields),
  }));
}

export async function createLocation(projectId: string, name: string): Promise<LocationRow> {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const location = await prisma.location.create({
    data: { projectId, name: name.trim() || "New location" },
  });

  return {
    id: location.id,
    name: location.name,
    description: location.description,
    notes: location.notes,
    worldbuilding: parseWorldbuilding(location.customFields),
  };
}

export interface LocationUpdateData {
  name?: string;
  description?: string | null;
  notes?: string | null;
  worldbuilding?: LocationWorldbuilding;
}

export async function updateLocation(
  locationId: string,
  projectId: string,
  data: LocationUpdateData
) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const { worldbuilding, ...rest } = data;

  await prisma.location.update({
    where: { id: locationId },
    data: {
      ...rest,
      ...(worldbuilding !== undefined ? { customFields: worldbuilding } : {}),
    },
  });
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
