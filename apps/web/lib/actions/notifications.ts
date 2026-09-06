"use server";

// A single lightweight notification feed -- friend requests, sprint
// invites, and (later) circle invites all land here, using the
// Notification model's flexible `payload` JSON block so each type can
// carry whatever it needs without its own table.
import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { requireUser } from "@/lib/actions/shared";

// The local (un-generated) Prisma client types everything as `any`/`{}`.
type NotificationRow = {
  id: string;
  type: string;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
};

export interface NotificationItem {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

export async function listNotifications(): Promise<NotificationItem[]> {
  const user = await requireUser();
  const rows = (await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 30,
  })) as NotificationRow[];
  return rows.map((n) => ({
    id: n.id,
    type: n.type,
    payload: (n.payload as Record<string, unknown>) ?? {},
    readAt: n.readAt,
    createdAt: n.createdAt,
  }));
}

export async function unreadNotificationCount(): Promise<number> {
  const user = await requireUser();
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}

export async function markNotificationRead(notificationId: string) {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { id: notificationId, userId: user.id },
    data: { readAt: new Date() },
  });
  revalidatePath("/friends");
  revalidatePath("/sprints");
}

export async function markAllNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/friends");
  revalidatePath("/sprints");
}
