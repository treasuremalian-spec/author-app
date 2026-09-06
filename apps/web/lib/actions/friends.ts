"use server";

// Friends -- a request/accept flow deliberately unrelated to Collaborator
// (see schema.prisma's section 8 comment: friendship never grants
// manuscript access on its own). userIdA is always whoever SENT the
// request, userIdB whoever received it -- that convention (rather than a
// separate requestedBy column) is enforced everywhere a Friendship row is
// created in this file, and depended on by acceptFriendRequest/
// declineFriendRequest to know who's allowed to act on a pending request.
import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { requireUser } from "@/lib/actions/shared";
import { effectivePresence, type EffectivePresence } from "@/lib/presence";

// The local (un-generated) Prisma client types everything as `any`/`{}`,
// so these shapes pin down exactly what we read off each row -- same
// pattern used throughout lib/actions and export-data.ts.
type AuthorProfileRow = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  presenceStatus: string;
  presenceUpdatedAt: Date | null;
};

type FriendshipRow = {
  id: string;
  userIdA: string;
  userIdB: string;
  status: "PENDING" | "ACCEPTED" | "BLOCKED";
  createdAt: Date;
};

export interface AuthorSearchResult {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  relationship: "self" | "none" | "pending_sent" | "pending_received" | "friends";
  friendshipId: string | null;
}

export interface FriendItem {
  friendshipId: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  presence: EffectivePresence;
}

export interface PendingRequestItem {
  friendshipId: string;
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
  createdAt: Date;
}

/** Finds an existing Friendship row between two users regardless of who sent it (A->B or B->A) -- the @@unique constraint is on the ordered pair, so a lookup has to check both orders. */
async function findFriendshipBetween(userIdX: string, userIdY: string) {
  return prisma.friendship.findFirst({
    where: {
      OR: [
        { userIdA: userIdX, userIdB: userIdY },
        { userIdA: userIdY, userIdB: userIdX },
      ],
    },
  });
}

export async function searchAuthors(query: string): Promise<AuthorSearchResult[]> {
  const user = await requireUser();
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const profiles = (await prisma.authorProfile.findMany({
    where: {
      userId: { not: user.id },
      OR: [
        { username: { contains: trimmed, mode: "insensitive" } },
        { displayName: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    take: 10,
    orderBy: { username: "asc" },
  })) as AuthorProfileRow[];
  if (profiles.length === 0) return [];

  const friendships = (await prisma.friendship.findMany({
    where: {
      OR: [
        { userIdA: user.id, userIdB: { in: profiles.map((p) => p.userId) } },
        { userIdB: user.id, userIdA: { in: profiles.map((p) => p.userId) } },
      ],
    },
  })) as FriendshipRow[];

  return profiles.map((p) => {
    const fs = friendships.find((f) => f.userIdA === p.userId || f.userIdB === p.userId);
    let relationship: AuthorSearchResult["relationship"] = "none";
    if (fs) {
      if (fs.status === "ACCEPTED") relationship = "friends";
      else if (fs.status === "PENDING") relationship = fs.userIdA === user.id ? "pending_sent" : "pending_received";
      else relationship = "none"; // BLOCKED -- treat as no visible relationship for search purposes
    }
    return {
      userId: p.userId,
      displayName: p.displayName,
      username: p.username,
      avatarUrl: p.avatarUrl,
      relationship,
      friendshipId: fs?.id ?? null,
    };
  });
}

export async function sendFriendRequest(targetUserId: string) {
  const user = await requireUser();
  if (targetUserId === user.id) throw new Error("You can't friend yourself.");

  const existing = await findFriendshipBetween(user.id, targetUserId);
  if (existing) {
    // Already connected (or already pending) one way or another -- nothing to do.
    return;
  }

  const friendship = await prisma.friendship.create({
    data: { userIdA: user.id, userIdB: targetUserId, status: "PENDING" },
  });

  const me = await prisma.authorProfile.findUnique({ where: { userId: user.id } });
  await prisma.notification.create({
    data: {
      userId: targetUserId,
      type: "FRIEND_REQUEST",
      payload: {
        friendshipId: friendship.id,
        fromUserId: user.id,
        fromDisplayName: me?.displayName ?? "A writer",
        fromUsername: me?.username ?? "",
      },
    },
  });

  revalidatePath("/friends");
}

export async function acceptFriendRequest(friendshipId: string) {
  const user = await requireUser();
  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || friendship.userIdB !== user.id || friendship.status !== "PENDING") {
    throw new Error("That friend request isn't waiting on you.");
  }
  await prisma.friendship.update({ where: { id: friendshipId }, data: { status: "ACCEPTED" } });
  revalidatePath("/friends");
}

export async function declineFriendRequest(friendshipId: string) {
  const user = await requireUser();
  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || (friendship.userIdA !== user.id && friendship.userIdB !== user.id)) {
    throw new Error("Friend request not found.");
  }
  await prisma.friendship.delete({ where: { id: friendshipId } });
  revalidatePath("/friends");
}

export async function removeFriend(friendshipId: string) {
  const user = await requireUser();
  const friendship = await prisma.friendship.findUnique({ where: { id: friendshipId } });
  if (!friendship || (friendship.userIdA !== user.id && friendship.userIdB !== user.id)) {
    throw new Error("Friendship not found.");
  }
  await prisma.friendship.delete({ where: { id: friendshipId } });
  revalidatePath("/friends");
}

export async function listFriends(): Promise<FriendItem[]> {
  const user = await requireUser();
  const friendships = (await prisma.friendship.findMany({
    where: {
      status: "ACCEPTED",
      OR: [{ userIdA: user.id }, { userIdB: user.id }],
    },
  })) as FriendshipRow[];
  if (friendships.length === 0) return [];

  const friendUserIds = friendships.map((f) => (f.userIdA === user.id ? f.userIdB : f.userIdA));
  const profiles = (await prisma.authorProfile.findMany({
    where: { userId: { in: friendUserIds } },
  })) as AuthorProfileRow[];
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  return friendships
    .map((f) => {
      const friendUserId = f.userIdA === user.id ? f.userIdB : f.userIdA;
      const profile = profileByUserId.get(friendUserId);
      if (!profile) return null;
      return {
        friendshipId: f.id,
        userId: friendUserId,
        displayName: profile.displayName,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        presence: effectivePresence(profile.presenceStatus, profile.presenceUpdatedAt),
      };
    })
    .filter((f): f is FriendItem => f !== null)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listPendingRequests(): Promise<{ incoming: PendingRequestItem[]; outgoing: PendingRequestItem[] }> {
  const user = await requireUser();
  const friendships = (await prisma.friendship.findMany({
    where: {
      status: "PENDING",
      OR: [{ userIdA: user.id }, { userIdB: user.id }],
    },
    orderBy: { createdAt: "desc" },
  })) as FriendshipRow[];
  if (friendships.length === 0) return { incoming: [], outgoing: [] };

  const otherUserIds = friendships.map((f) => (f.userIdA === user.id ? f.userIdB : f.userIdA));
  const profiles = (await prisma.authorProfile.findMany({
    where: { userId: { in: otherUserIds } },
  })) as AuthorProfileRow[];
  const profileByUserId = new Map(profiles.map((p) => [p.userId, p]));

  const incoming: PendingRequestItem[] = [];
  const outgoing: PendingRequestItem[] = [];

  for (const f of friendships) {
    const otherUserId = f.userIdA === user.id ? f.userIdB : f.userIdA;
    const profile = profileByUserId.get(otherUserId);
    if (!profile) continue;
    const item: PendingRequestItem = {
      friendshipId: f.id,
      userId: otherUserId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      createdAt: f.createdAt,
    };
    if (f.userIdB === user.id) incoming.push(item);
    else outgoing.push(item);
  }

  return { incoming, outgoing };
}
