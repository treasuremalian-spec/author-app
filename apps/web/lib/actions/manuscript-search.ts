"use server";

// Server-side half of book-wide find & replace (author request,
// 2026-09-11: "can we add a search bar to the toolbar where we can search
// words or phrases in the book to jump to it"). Finding matches and
// jumping to one is entirely client-side (ProjectWorkspace/BookSearchPanel
// already hold every chapter's content in memory) -- this action is only
// needed for "Replace All", since that has to persist a change to
// possibly every scene in the project, most of which aren't the one
// currently open in the editor.
import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { requireUser, assertProjectOwnership } from "./shared";
import { persistSceneContent } from "@/lib/scene-save";
import { docFromContent, findMatches, replaceWithinTextNodes } from "@/lib/manuscript-search";

export interface ReplaceInBookResult {
  chaptersChanged: number;
  occurrencesReplaced: number;
  occurrencesSkipped: number;
}

export async function replaceInBook(
  projectId: string,
  query: string,
  replacement: string,
  opts?: { caseSensitive?: boolean }
): Promise<ReplaceInBookResult> {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return { chaptersChanged: 0, occurrencesReplaced: 0, occurrencesSkipped: 0 };
  }

  const scenes = await prisma.scene.findMany({
    where: { node: { projectId } },
    select: { id: true, content: true },
  });

  let chaptersChanged = 0;
  let occurrencesReplaced = 0;
  let occurrencesSkipped = 0;

  for (const scene of scenes) {
    const doc = docFromContent(scene.content);
    if (!doc) continue;

    // The real, cross-boundary-aware match count (same engine the
    // client's results list uses) -- the gap between this and what
    // replaceWithinTextNodes() actually applies below is exactly the
    // "crosses a formatting boundary, skipped" count reported back.
    const allMatches = findMatches(doc, trimmedQuery, opts);
    if (allMatches.length === 0) continue;

    const { content: newContent, replacedCount } = replaceWithinTextNodes(
      scene.content,
      trimmedQuery,
      replacement,
      opts?.caseSensitive ?? false
    );

    occurrencesSkipped += allMatches.length - replacedCount;
    if (replacedCount === 0) continue;

    occurrencesReplaced += replacedCount;
    chaptersChanged += 1;
    await persistSceneContent(scene.id, newContent, user.id);
  }

  revalidatePath(`/projects/${projectId}`);

  return { chaptersChanged, occurrencesReplaced, occurrencesSkipped };
}
