// TEMPORARY diagnostic route -- checks whether the social/sprint tables
// already defined in schema.prisma (Friendship, WritingCircle, Sprint,
// Notification, AuthorProfile.presenceStatus) actually exist in the live
// database yet, since `prisma db push` can't be run from this session's
// device shell (no network path to Supabase -- see project memory).
// Delete this route once that's confirmed either way.
import { NextResponse } from "next/server";
import { prisma } from "@author-app/database";

export async function GET() {
  const checks: Record<string, { ok: boolean; detail: string }> = {};

  async function check(name: string, fn: () => Promise<unknown>) {
    try {
      await fn();
      checks[name] = { ok: true, detail: "table reachable" };
    } catch (err) {
      checks[name] = { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  await check("friendship", () => prisma.friendship.count());
  await check("writingCircle", () => prisma.writingCircle.count());
  await check("circleMember", () => prisma.circleMember.count());
  await check("sprint", () => prisma.sprint.count());
  await check("sprintParticipant", () => prisma.sprintParticipant.count());
  await check("notification", () => prisma.notification.count());
  await check("authorProfile_presenceStatus", () =>
    prisma.authorProfile.findFirst({ select: { presenceStatus: true } })
  );
  await check("writingGoal", () => prisma.writingGoal.count());
  await check("dailyWritingStat", () => prisma.dailyWritingStat.count());
  await check("userAchievement", () => prisma.userAchievement.count());

  return NextResponse.json(checks);
}
