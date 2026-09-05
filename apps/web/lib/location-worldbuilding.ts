// Shared worldbuilding-section data for Locations. Deliberately NOT a
// server-actions file (no "use server") -- a file with that directive may
// only export async functions, so this plain constant/helper module is what
// both lib/actions/story-bible.ts (server) and LocationsPanel.tsx (client)
// import from.
//
// Inspired by the "A Whole New World" worldbuilding page in Tasia's Notion
// Writer's Bible template. These sections live inside Location's existing
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

/** Safely read the worldbuilding sections back out of Location.customFields. */
export function parseWorldbuilding(raw: unknown): LocationWorldbuilding {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result: LocationWorldbuilding = {};
  for (const section of LOCATION_WORLDBUILDING_SECTIONS) {
    const value = source[section.key];
    result[section.key] = typeof value === "string" ? value : null;
  }
  return result;
}

/**
 * Prisma's Json input type doesn't accept `undefined`, only string/null --
 * flatten a (possibly partial) worldbuilding object into a plain,
 * fully-populated shape right before writing it to customFields.
 */
export function normalizeWorldbuilding(worldbuilding: LocationWorldbuilding): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const section of LOCATION_WORLDBUILDING_SECTIONS) {
    result[section.key] = worldbuilding[section.key] ?? null;
  }
  return result;
}
