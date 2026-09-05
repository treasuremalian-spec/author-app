// Shared writing-progress math -- used by both the per-book Overview
// dashboard and the cross-book progress view on /library, so the two
// never drift apart on how "days remaining" or "words/day needed" are
// computed. Plain module, no "use server"/"use client" -- safe to import
// from either.

export function daysBetween(from: Date, to: Date): number {
  const f = new Date(from);
  const t = new Date(to);
  const ms = t.setHours(0, 0, 0, 0) - f.setHours(0, 0, 0, 0);
  return Math.round(ms / 86400000);
}

export function progressPercent(
  current: number,
  target: number | null | undefined
): number | null {
  if (!target || target <= 0) return null;
  return Math.min(100, Math.round((current / target) * 100));
}

export function daysRemaining(deadline: Date | string | null | undefined): number | null {
  if (!deadline) return null;
  return daysBetween(new Date(), new Date(deadline));
}

export function wordsPerDayNeeded(
  current: number,
  target: number | null | undefined,
  deadline: Date | string | null | undefined
): number | null {
  if (!target || target <= 0) return null;
  const remaining = daysRemaining(deadline);
  if (remaining === null || remaining <= 0) return null;
  return Math.max(0, Math.ceil((target - current) / remaining));
}
