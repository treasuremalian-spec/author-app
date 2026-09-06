"use server";

import { prisma } from "@author-app/database";
import { requireUser } from "@/lib/actions/shared";

export type PresenceStatusValue = "ONLINE" | "WRITING" | "SPRINTING" | "BUSY" | "INVISIBLE";

/** Sets the caller's presence status and bumps presenceUpdatedAt -- see lib/presence.ts for how staleness turns this into what a friend actually sees. Deliberately silent/best-effort: presence is a nice-to-have, never something worth surfacing an error over. */
export async function setPresence(status: PresenceStatusValue) {
  try {
    const user = await requireUser();
    await prisma.authorProfile.update({
      where: { userId: user.id },
      data: { presenceStatus: status, presenceUpdatedAt: new Date() },
    });
  } catch {
    // Not logged in yet, profile doesn't exist yet, or a transient DB hiccup
    // -- none of these should ever surface to the person as an error.
  }
}
