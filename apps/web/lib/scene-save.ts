// Plain (non-"use server") module holding the actual scene-save database
// logic, used by the /api/scenes/[sceneId]/save Route Handler.
//
// This used to be a Server Action (saveSceneContent in lib/actions/manuscript.ts),
// called directly from the editor. That hit two real, hard-to-diagnose
// framework issues in a row: Next redacts a thrown Server Action error in
// production to a useless "Minified React error #441" with no real
// message, and separately, returning a plain result object from that
// action still triggered a "temporary client reference" crash somewhere
// in React's Server Action serialization for this call shape. A Route
// Handler sidesteps both -- it's a plain HTTP request/response with a
// JSON body, no Server Action "Flight" serialization involved, and it's
// the same proven pattern already used successfully for the EPUB/PDF
// export routes (see lib/export-data.ts).
import { prisma } from "@author-app/database";
import { countWords } from "@/lib/wordcount";

// How long we let sit between autosave calls before we also stash a
// restorable snapshot -- frequent enough that undo history is meaningful,
// rare enough that we're not writing hundreds of snapshots a day.
const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;

export async function persistSceneContent(
  sceneId: string,
  content: unknown,
  savedById: string
): Promise<{ wordCount: number }> {
  const wordCount = countWords(content);

  const latestVersion = await prisma.sceneVersion.findFirst({
    where: { sceneId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  const needsSnapshot =
    !latestVersion ||
    Date.now() - latestVersion.createdAt.getTime() > SNAPSHOT_INTERVAL_MS;

  await prisma.$transaction([
    prisma.scene.update({
      where: { id: sceneId },
      data: { content: content as object, wordCount },
    }),
    ...(needsSnapshot
      ? [
          prisma.sceneVersion.create({
            data: { sceneId, content: content as object, wordCount, savedById },
          }),
        ]
      : []),
  ]);

  await syncActiveSprintWordCount(savedById);

  return { wordCount };
}

/** If this writer is in a currently-ACTIVE sprint, refreshes their live
 * word count there too -- this is what makes a sprint's word counts feel
 * "real-time" without a separate tracking mechanism: every autosave
 * doubles as a sprint tick. Best-effort/non-blocking: a hiccup here
 * should never fail the actual scene save, which is why this awaits at
 * the end rather than being part of the transaction above. */
async function syncActiveSprintWordCount(userId: string): Promise<void> {
  try {
    const activeParticipations = (await prisma.sprintParticipant.findMany({
      where: { userId, sprint: { status: "ACTIVE" } },
      select: { id: true },
    })) as { id: string }[];
    if (activeParticipations.length === 0) return;

    const agg = await prisma.scene.aggregate({
      where: { node: { project: { userId } } },
      _sum: { wordCount: true },
    });
    const total = agg._sum.wordCount ?? 0;

    await prisma.sprintParticipant.updateMany({
      where: { id: { in: activeParticipations.map((p) => p.id) } },
      data: { currentWordCount: total },
    });
  } catch (err) {
    console.error("Sprint word-count sync failed (non-blocking) for user", userId, err);
  }
}
