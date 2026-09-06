// Shared between the sprints server actions (lib/actions/sprints.ts, a
// "use server" file that may ONLY export async functions -- see Next.js's
// server-actions build rule) and client components like
// CreateSprintDialog.tsx that need the same duration options for their UI.
// Kept in its own plain module so neither side has to re-export a
// non-function value out of a "use server" file, which fails the build.
export const SPRINT_DURATIONS_MINUTES = [15, 25, 45, 60] as const;
