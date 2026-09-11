/**
 * One-off data migration -- Part A of the 2026-09-11 manuscript-tab rework.
 *
 * Chapters are now the single writing surface: each CHAPTER node carries
 * its own Scene directly (Scene.nodeId can point at any ManuscriptNode,
 * not just a SCENE-typed one -- see the schema comment on
 * ManuscriptNode.scene). This script finds every CHAPTER still in the OLD
 * shape (child SCENE nodes underneath it, or no scene at all) and fixes
 * it up:
 *
 *   - CHAPTER with no scene and no SCENE children -> gets a fresh empty
 *     Scene attached directly, so it's still writable in the new UI
 *     (matches what a freshly created chapter now gets automatically).
 *   - CHAPTER with exactly one child SCENE -> that Scene is repointed to
 *     the CHAPTER itself, and the now-empty SCENE node is deleted.
 *   - CHAPTER with multiple child SCENEs (ordered by orderIndex) -> their
 *     content is concatenated in order, with a "⁂" scene-break inserted
 *     between each pair (the same manual scene-break node the editor
 *     already supports). The first Scene's row is reused as the merged
 *     result (repointed to the CHAPTER, word count recomputed); the
 *     other SCENE nodes are deleted.
 *
 * Every scene about to be merged or discarded is written to a timestamped
 * JSON backup file BEFORE anything is changed or deleted, so nothing here
 * is unrecoverable.
 *
 * Cascade-delete safety: Scene.node and SceneVersion.scene both cascade
 * on delete, so a Scene is always repointed to its new CHAPTER node
 * *before* the old SCENE node is deleted -- never the other way around.
 *
 * Usage -- run this yourself, in your own Terminal (not through Claude),
 * from the packages/database directory:
 *
 *   cd "Author App/packages/database"
 *   npx tsx --env-file=.env scripts/merge-multiscene-chapters.ts --dry-run
 *
 * Read the dry-run output carefully. When it looks right, run it for real
 * (same command, without --dry-run):
 *
 *   npx tsx --env-file=.env scripts/merge-multiscene-chapters.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };
const SCENE_BREAK = { type: "sceneBreak", attrs: { ornament: "⁂" } };

type DocNode = { type?: string; text?: string; content?: DocNode[] };

function extractText(node: DocNode | null | undefined): string {
  if (!node) return "";
  let text = node.text ?? "";
  if (node.content) {
    for (const child of node.content) text += " " + extractText(child);
  }
  return text;
}

function countWords(doc: unknown): number {
  const text = extractText(doc as DocNode).trim();
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function mergeContents(docs: unknown[]): { type: string; content: unknown[] } {
  const parts: unknown[] = [];
  docs.forEach((doc, i) => {
    const content = (doc as { content?: unknown[] })?.content;
    parts.push(...(Array.isArray(content) && content.length > 0 ? content : [{ type: "paragraph" }]));
    if (i < docs.length - 1) parts.push(SCENE_BREAK);
  });
  return { type: "doc", content: parts };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set -- run this with --env-file=.env (see the usage comment at the top of this file).");
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log(DRY_RUN ? "=== DRY RUN -- nothing will be written ===\n" : "=== LIVE RUN -- writing changes ===\n");

  const chapters = await prisma.manuscriptNode.findMany({
    where: { type: "CHAPTER" },
    include: {
      scene: true,
      children: {
        where: { type: "SCENE" },
        orderBy: { orderIndex: "asc" },
        include: { scene: true },
      },
    },
    orderBy: { orderIndex: "asc" },
  });

  const backup: unknown[] = [];
  let emptyFixed = 0;
  let singleMerged = 0;
  let multiMerged = 0;
  let skippedAlready = 0;
  let skippedInconsistent = 0;

  for (const chapter of chapters as any[]) {
    const sceneChildren = chapter.children.filter((c: any) => c.scene);
    const orphanChildren = chapter.children.filter((c: any) => !c.scene);
    if (orphanChildren.length > 0) {
      console.warn(
        `  [warning] Chapter "${chapter.title}" (${chapter.id}) has ${orphanChildren.length} SCENE-type child node(s) with no Scene row -- left untouched: ${orphanChildren.map((c: any) => c.id).join(", ")}`
      );
    }

    if (chapter.scene && sceneChildren.length > 0) {
      // Shouldn't happen with legitimate data (see comment above), but
      // don't risk a unique-constraint error on Scene.nodeId -- flag and skip.
      console.warn(
        `  [skip: inconsistent] Chapter "${chapter.title}" (${chapter.id}) already has its own scene AND ${sceneChildren.length} child scene(s) -- needs manual review, left untouched.`
      );
      skippedInconsistent++;
      continue;
    }

    if (chapter.scene && sceneChildren.length === 0) {
      skippedAlready++; // already in the new shape
      continue;
    }

    if (sceneChildren.length === 0) {
      emptyFixed++;
      console.log(`[empty->create] Chapter "${chapter.title}" (${chapter.id}): creating empty Scene`);
      if (!DRY_RUN) {
        await prisma.scene.create({ data: { nodeId: chapter.id, content: EMPTY_DOC } });
      }
      continue;
    }

    // Back up every scene about to be merged/discarded before touching anything.
    for (const child of sceneChildren) {
      backup.push({
        chapterId: chapter.id,
        chapterTitle: chapter.title,
        sceneNodeId: child.id,
        scene: child.scene,
      });
    }

    if (sceneChildren.length === 1) {
      singleMerged++;
      const only = sceneChildren[0];
      console.log(`[single] Chapter "${chapter.title}" (${chapter.id}): repointing scene from node ${only.id}`);
      if (!DRY_RUN) {
        await prisma.scene.update({ where: { id: only.scene.id }, data: { nodeId: chapter.id } });
        await prisma.manuscriptNode.delete({ where: { id: only.id } });
      }
      continue;
    }

    multiMerged++;
    const mergedDoc = mergeContents(sceneChildren.map((c: any) => c.scene.content));
    const mergedWordCount = countWords(mergedDoc);
    const [first, ...rest] = sceneChildren;
    console.log(
      `[multi] Chapter "${chapter.title}" (${chapter.id}): merging ${sceneChildren.length} scenes into node ${first.id} (${mergedWordCount} words total)`
    );
    if (!DRY_RUN) {
      await prisma.scene.update({
        where: { id: first.scene.id },
        data: { nodeId: chapter.id, content: mergedDoc, wordCount: mergedWordCount },
      });
      await prisma.manuscriptNode.delete({ where: { id: first.id } });
      for (const child of rest) {
        await prisma.manuscriptNode.delete({ where: { id: child.id } });
      }
    }
  }

  if (backup.length > 0) {
    const backupPath = path.join(__dirname, `scene-merge-backup-${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
    console.log(`\nBacked up ${backup.length} scene(s) that will be merged/discarded to:\n  ${backupPath}`);
  }

  console.log("\n=== Summary ===");
  console.log(`Chapters already in the new shape (skipped): ${skippedAlready}`);
  console.log(`Empty chapters given a fresh scene: ${emptyFixed}`);
  console.log(`Single-scene chapters repointed: ${singleMerged}`);
  console.log(`Multi-scene chapters merged: ${multiMerged}`);
  if (skippedInconsistent > 0) {
    console.log(`Skipped for manual review (inconsistent state): ${skippedInconsistent}`);
  }
  if (DRY_RUN) {
    console.log("\nThis was a dry run -- nothing was changed. Re-run without --dry-run to apply.");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
