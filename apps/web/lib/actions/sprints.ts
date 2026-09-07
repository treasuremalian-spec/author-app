"use server";

// Writing sprints -- timed, synced-start sessions. Everyone who joined
// before the creator hits "Start" begins at the exact same moment
// (startedAt), same duration, and the results screen compares how many
// words each person wrote in that window. SprintParticipant only ever
// stores word-count numbers (see schema.prisma's section 10 comment) --
// never manuscript content -- so a sprint can't leak what anyone actually
// wrote, only how much.
import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { requireUser } from "@/lib/actions/shared";
import { effectivePresence, type EffectivePresence } from "@/lib/presence";
import { SPRINT_DURATIONS_MINUTES } from "@/lib/sprint-constants";

type SprintRow = {
  id: string;
  creatorId: string;
  type: "SOLO" | "FRIEND" | "GROUP" | "CIRCLE";
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "CANCELED";
  durationMinutes: number;
  wordGoal: number | null;
  isPublic: boolean;
  scheduledStart: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
};

type SprintParticipantRow = {
  id: string;
  sprintId: string;
  userId: string;
  startingWordCount: number;
  currentWordCount: number;
  endingWordCount: number | null;
  joinedAt: Date;
};

type AuthorProfileRow = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  presenceStatus: string;
  presenceUpdatedAt: Date | null;
};

export interface SprintParticipantView {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  presence: EffectivePresence;
  startingWordCount: number;
  currentWordCount: number;
  endingWordCount: number | null;
  wordsWritten: number;
}

export interface SprintDetail {
  id: string;
  creatorId: string;
  creatorDisplayName: string;
  type: SprintRow["type"];
  status: SprintRow["status"];
  durationMinutes: number;
  wordGoal: number | null;
  isPublic: boolean;
  startedAt: string | null;
  endedAt: string | null;
  endsAt: string | null;
  participants: SprintParticipantView[];
  isCreator: boolean;
  isParticipant: boolean;
}

export interface SprintListItem {
  id: string;
  creatorDisplayName: string;
  creatorAvatarUrl: string | null;
  durationMinutes: number;
  wordGoal: number | null;
  status: SprintRow["status"];
  participantCount: number;
  isParticipant: boolean;
  createdAt: string;
}

async function getUserTotalWordCount(userId: string): Promise<number> {
  const agg = await prisma.scene.aggregate({
    where: { node: { project: { userId } } },
    _sum: { wordCount: true },
  });
  return agg._sum.wordCount ?? 0;
}

/** If an ACTIVE sprint's clock has actually run out, closes it out --
 * captures a final word count for every participant and flips it to
 * COMPLETED. Called from every read path (getSprintDetail, the list
 * actions) rather than a background job, consistent with the rest of
 * this app's no-cron architecture -- whoever next looks at the sprint is
 * the one who finalizes it. */
async function finalizeIfExpired(sprint: SprintRow): Promise<SprintRow> {
  if (sprint.status !== "ACTIVE" || !sprint.startedAt) return sprint;
  const endsAt = sprint.startedAt.getTime() + sprint.durationMinutes * 60 * 1000;
  if (Date.now() < endsAt) return sprint;

  const participants = (await prisma.sprintParticipant.findMany({
    where: { sprintId: sprint.id },
  })) as SprintParticipantRow[];

  await Promise.all(
    participants.map(async (p) => {
      const total = await getUserTotalWordCount(p.userId);
      await prisma.sprintParticipant.update({
        where: { id: p.id },
        data: { currentWordCount: total, endingWordCount: total },
      });
    })
  );

  return (await prisma.sprint.update({
    where: { id: sprint.id },
    data: { status: "COMPLETED", endedAt: new Date() },
  })) as SprintRow;
}

export interface CreateSprintInput {
  durationMinutes: number;
  wordGoal?: number | null;
  isPublic: boolean;
  inviteFriendUserIds?: string[];
}

export async function createSprint(input: CreateSprintInput): Promise<{ sprintId: string }> {
  const user = await requireUser();

  const durationMinutes = SPRINT_DURATIONS_MINUTES.includes(input.durationMinutes as (typeof SPRINT_DURATIONS_MINUTES)[number])
    ? input.durationMinutes
    : 25;
  const inviteIds = Array.from(new Set(input.inviteFriendUserIds ?? [])).filter((id) => id !== user.id);

  const type: SprintRow["type"] = input.isPublic ? "GROUP" : inviteIds.length > 0 ? "FRIEND" : "SOLO";

  const sprint = (await prisma.sprint.create({
    data: {
      creatorId: user.id,
      type,
      status: "SCHEDULED",
      durationMinutes,
      wordGoal: input.wordGoal || null,
      isPublic: input.isPublic,
    },
  })) as SprintRow;

  const startingWordCount = await getUserTotalWordCount(user.id);
  await prisma.sprintParticipant.create({
    data: { sprintId: sprint.id, userId: user.id, startingWordCount, currentWordCount: startingWordCount },
  });

  if (inviteIds.length > 0) {
    const me = (await prisma.authorProfile.findUnique({ where: { userId: user.id } })) as AuthorProfileRow | null;
    // Only invite people who are actually friends -- a Notification alone
    // isn't a manuscript-access grant, but there's no reason to let a
    // sprint invite reach someone who was never a confirmed friend.
    const friendships = (await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: inviteIds.map((id) => ({
          OR: [
            { userIdA: user.id, userIdB: id },
            { userIdA: id, userIdB: user.id },
          ],
        })),
      },
    })) as { userIdA: string; userIdB: string }[];
    const confirmedFriendIds = new Set(
      friendships.map((f) => (f.userIdA === user.id ? f.userIdB : f.userIdA))
    );

    await Promise.all(
      inviteIds
        .filter((id) => confirmedFriendIds.has(id))
        .map((id) =>
          prisma.notification.create({
            data: {
              userId: id,
              type: "SPRINT_INVITE",
              payload: {
                sprintId: sprint.id,
                fromUserId: user.id,
                fromDisplayName: me?.displayName ?? "A writer",
                durationMinutes,
              },
            },
          })
        )
    );
  }

  revalidatePath("/sprints");
  return { sprintId: sprint.id };
}

export async function joinSprint(sprintId: string) {
  const user = await requireUser();
  const sprint = (await prisma.sprint.findUnique({ where: { id: sprintId } })) as SprintRow | null;
  if (!sprint || sprint.status !== "SCHEDULED") {
    throw new Error("This sprint isn't open to join right now.");
  }

  const existing = await prisma.sprintParticipant.findUnique({
    where: { sprintId_userId: { sprintId, userId: user.id } },
  });
  if (existing) return;

  if (!sprint.isPublic) {
    const invited = await prisma.notification.findFirst({
      where: { userId: user.id, type: "SPRINT_INVITE" },
    });
    const wasInvited =
      invited && (invited.payload as { sprintId?: string } | null)?.sprintId === sprintId;
    // Fall back to "were we ever sent an invite to this sprint" via a
    // broader scan if the single findFirst above missed it (Notification
    // has no index on payload contents, so this is deliberately a small
    // safety net, not the primary check).
    if (!wasInvited) {
      const allMyInvites = (await prisma.notification.findMany({
        where: { userId: user.id, type: "SPRINT_INVITE" },
      })) as { payload: unknown }[];
      const reallyInvited = allMyInvites.some(
        (n: { payload: unknown }) => (n.payload as { sprintId?: string } | null)?.sprintId === sprintId
      );
      if (!reallyInvited && sprint.creatorId !== user.id) {
        throw new Error("This sprint is invite-only.");
      }
    }
  }

  const startingWordCount = await getUserTotalWordCount(user.id);
  await prisma.sprintParticipant.create({
    data: { sprintId, userId: user.id, startingWordCount, currentWordCount: startingWordCount },
  });

  revalidatePath("/sprints");
  revalidatePath(`/sprints/${sprintId}`);
}

export async function leaveSprint(sprintId: string) {
  const user = await requireUser();
  const sprint = (await prisma.sprint.findUnique({ where: { id: sprintId } })) as SprintRow | null;
  if (!sprint || sprint.status !== "SCHEDULED") {
    throw new Error("You can only leave a sprint before it starts.");
  }
  await prisma.sprintParticipant.deleteMany({ where: { sprintId, userId: user.id } });
  revalidatePath("/sprints");
  revalidatePath(`/sprints/${sprintId}`);
}

export async function startSprint(sprintId: string) {
  const user = await requireUser();
  const sprint = (await prisma.sprint.findUnique({ where: { id: sprintId } })) as SprintRow | null;
  if (!sprint || sprint.creatorId !== user.id || sprint.status !== "SCHEDULED") {
    throw new Error("Only the sprint's creator can start it.");
  }
  await prisma.sprint.update({ where: { id: sprintId }, data: { status: "ACTIVE", startedAt: new Date() } });
  revalidatePath(`/sprints/${sprintId}`);
}

export async function cancelSprint(sprintId: string) {
  const user = await requireUser();
  const sprint = (await prisma.sprint.findUnique({ where: { id: sprintId } })) as SprintRow | null;
  if (!sprint || sprint.creatorId !== user.id || sprint.status !== "SCHEDULED") {
    throw new Error("Only the sprint's creator can cancel it, and only before it starts.");
  }
  await prisma.sprint.update({ where: { id: sprintId }, data: { status: "CANCELED" } });
  revalidatePath("/sprints");
  revalidatePath(`/sprints/${sprintId}`);
}

export async function getSprintDetail(sprintId: string): Promise<SprintDetail | null> {
  const user = await requireUser();
  let sprint = (await prisma.sprint.findUnique({ where: { id: sprintId } })) as SprintRow | null;
  if (!sprint) return null;
  sprint = await finalizeIfExpired(sprint);

  const [participants, creatorProfile] = await Promise.all([
    prisma.sprintParticipant.findMany({ where: { sprintId } }) as Promise<SprintParticipantRow[]>,
    prisma.authorProfile.findUnique({ where: { userId: sprint.creatorId } }) as Promise<AuthorProfileRow | null>,
  ]);

  const profiles = (await prisma.authorProfile.findMany({
    where: { userId: { in: participants.map((p) => p.userId) } },
  })) as AuthorProfileRow[];
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  const participantViews: SprintParticipantView[] = participants
    .map((p) => {
      const profile = profileByUserId.get(p.userId);
      if (!profile) return null;
      const ending = p.endingWordCount;
      const words = (ending ?? p.currentWordCount) - p.startingWordCount;
      return {
        userId: p.userId,
        displayName: profile.displayName,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        presence: effectivePresence(profile.presenceStatus, profile.presenceUpdatedAt),
        startingWordCount: p.startingWordCount,
        currentWordCount: p.currentWordCount,
        endingWordCount: p.endingWordCount,
        wordsWritten: Math.max(0, words),
      };
    })
    .filter((p): p is SprintParticipantView => p !== null)
    .sort((a, b) => b.wordsWritten - a.wordsWritten);

  const endsAt = sprint.startedAt
    ? new Date(sprint.startedAt.getTime() + sprint.durationMinutes * 60 * 1000).toISOString()
    : null;

  return {
    id: sprint.id,
    creatorId: sprint.creatorId,
    creatorDisplayName: creatorProfile?.displayName ?? "A writer",
    type: sprint.type,
    status: sprint.status,
    durationMinutes: sprint.durationMinutes,
    wordGoal: sprint.wordGoal,
    isPublic: sprint.isPublic,
    startedAt: sprint.startedAt?.toISOString() ?? null,
    endedAt: sprint.endedAt?.toISOString() ?? null,
    endsAt,
    participants: participantViews,
    isCreator: sprint.creatorId === user.id,
    isParticipant: participants.some((p) => p.userId === user.id),
  };
}

export async function listPublicSprints(): Promise<SprintListItem[]> {
  const user = await requireUser();
  const sprints = (await prisma.sprint.findMany({
    where: { isPublic: true, status: "SCHEDULED" },
    orderBy: { createdAt: "desc" },
    take: 20,
  })) as SprintRow[];
  if (sprints.length === 0) return [];

  return buildSprintListItems(sprints, user.id);
}

export async function listMySprints(): Promise<SprintListItem[]> {
  const user = await requireUser();
  const myParticipations = (await prisma.sprintParticipant.findMany({
    where: { userId: user.id },
    select: { sprintId: true },
  })) as { sprintId: string }[];
  const sprintIds = Array.from(new Set(myParticipations.map((p) => p.sprintId)));
  if (sprintIds.length === 0) return [];

  const sprints = (await prisma.sprint.findMany({
    where: { id: { in: sprintIds }, status: { in: ["SCHEDULED", "ACTIVE"] } },
    orderBy: { createdAt: "desc" },
  })) as SprintRow[];

  // A sprint whose clock ran out needs finalizing before we report it as
  // still "ACTIVE" to the list.
  const resolved = await Promise.all(sprints.map((s) => finalizeIfExpired(s)));
  const stillOpen = resolved.filter((s) => s.status === "SCHEDULED" || s.status === "ACTIVE");

  return buildSprintListItems(stillOpen, user.id);
}

async function buildSprintListItems(sprints: SprintRow[], userId: string): Promise<SprintListItem[]> {
  const creatorProfiles = (await prisma.authorProfile.findMany({
    where: { userId: { in: sprints.map((s) => s.creatorId) } },
  })) as AuthorProfileRow[];
  const creatorByUserId = new Map(creatorProfiles.map((p) => [p.userId, p]));

  // Prisma's groupBy() has a notoriously finicky generic signature -- the
  // "by" array needs to be a literal tuple type (via "as const"), not a
  // plain string[], for its conditional-type overload resolution to work
  // against a real, freshly generated client. Without "as const" this
  // type-checks fine locally (this sandbox's Prisma client is permanently
  // stale/untyped -- see docs/decisions), but fails Vercel's build, which
  // always regenerates a fresh client first.
  const participantCounts = (await prisma.sprintParticipant.groupBy({
    by: ["sprintId"] as const,
    where: { sprintId: { in: sprints.map((s) => s.id) } },
    _count: { userId: true },
  })) as { sprintId: string; _count: { userId: number } }[];
  const countBySprintId = new Map<string, number>(
    participantCounts.map((c) => [c.sprintId, c._count.userId])
  );

  const myParticipations = (await prisma.sprintParticipant.findMany({
    where: { userId, sprintId: { in: sprints.map((s) => s.id) } },
    select: { sprintId: true },
  })) as { sprintId: string }[];
  const myParticipantSprintIds = new Set(myParticipations.map((p) => p.sprintId));

  return sprints.map((s) => ({
    id: s.id,
    creatorDisplayName: creatorByUserId.get(s.creatorId)?.displayName ?? "A writer",
    creatorAvatarUrl: creatorByUserId.get(s.creatorId)?.avatarUrl ?? null,
    durationMinutes: s.durationMinutes,
    wordGoal: s.wordGoal,
    status: s.status,
    participantCount: countBySprintId.get(s.id) ?? 0,
    isParticipant: myParticipantSprintIds.has(s.id),
    createdAt: s.createdAt.toISOString(),
  }));
}
