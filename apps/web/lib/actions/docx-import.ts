"use server";

// Two author-requested (2026-09-07) flows built on the same parsing step
// (packages/formatting-engine/docx-import.ts): starting a brand-new
// project from a manuscript someone began writing in Word, and
// re-importing an edited copy of an exported manuscript to replace an
// existing project's chapters/scenes wholesale (e.g. after sending a
// Word export -- see build-docx.ts -- out to an editor and getting
// tracked changes back).
//
// Both take a Supabase Storage PATH (not a public URL -- the
// "manuscript-imports" bucket is private, see supabase/migrations/
// 0008_manuscript_imports_storage.sql) that the client already uploaded
// to directly, the same upload-then-record pattern Toolbar.tsx uses for
// inline images. The file is read back here with this same request's own
// authenticated Supabase client, so Storage's row-level security (the
// uploader can only ever read their own uploads) does the real
// enforcement -- assertProjectOwnership below is what stops uploading to
// one project and replacing a DIFFERENT one you don't own, which RLS on
// the file alone can't express.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@author-app/database";
import { parseManuscriptDocx, type ParsedChapter } from "@author-app/formatting-engine";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";
import { createClient } from "@/lib/supabase/server";

async function downloadAndParse(storagePath: string, fallbackTitle: string): Promise<ParsedChapter[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("manuscript-imports").download(storagePath);
  if (error || !data) {
    throw new Error("Couldn't read that uploaded file -- try uploading it again.");
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  const chapters = await parseManuscriptDocx(buffer, fallbackTitle);

  // Best-effort cleanup -- the parsed chapters are what matters from here
  // on; leaving the raw upload around serves no purpose and a failure to
  // delete it should never block the import that already succeeded.
  await supabase.storage.from("manuscript-imports").remove([storagePath]).catch(() => {});

  return chapters;
}

// Each parsed chapter becomes a CHAPTER node with exactly one SCENE child
// holding the actual content -- matching how every other part of this app
// (the writing editor, the EPUB/PDF/DOCX exporters' toChapter() in
// export-data.ts) expects the tree to be shaped: a CHAPTER's own prose
// always lives on a SCENE child, never on the chapter node itself.
async function writeChaptersToProject(projectId: string, chapters: ParsedChapter[]) {
  await prisma.$transaction(
    chapters.map((chapter, index) =>
      prisma.manuscriptNode.create({
        data: {
          projectId,
          parentId: null,
          type: "CHAPTER",
          title: chapter.title || `Chapter ${index + 1}`,
          orderIndex: index,
          children: {
            create: [
              {
                projectId,
                type: "SCENE",
                title: "Scene 1",
                orderIndex: 0,
                // Cast to object, same as scene-save.ts's autosave path -- Prisma's
                // generated Json input type wants an index-signature-compatible
                // InputJsonValue, which a concretely-typed value like ParsedChapter's
                // (built from the DocNode interface) does not structurally satisfy even
                // though it IS plain JSON-compatible data at runtime. Confirmed
                // 2026-09-07 via a real Vercel build log (this sandbox's stale local
                // Prisma client can't catch this -- see project memory).
                scene: { create: { content: chapter.content as object } },
              },
            ],
          },
        },
      })
    )
  );
}

/** Starts a brand-new project from an uploaded .docx manuscript --
 * headings become chapters, each chapter's paragraphs become that
 * chapter's single scene. Redirects straight into the new project, same
 * as createProject() in manuscript.ts. */
export async function importDocxAsProject(storagePath: string, title: string) {
  const user = await requireUser();

  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    redirect(`/library?error=${encodeURIComponent("Give your book a title first.")}`);
  }

  const chapters = await downloadAndParse(storagePath, trimmedTitle);

  const project = await prisma.project.create({
    data: { userId: user.id, title: trimmedTitle },
  });

  await writeChaptersToProject(project.id, chapters);

  redirect(`/projects/${project.id}`);
}

/** Replaces an EXISTING project's entire chapter/scene tree with the
 * content of an uploaded .docx -- the "send it out for edits, bring the
 * edited file back" flow. Deliberately wholesale (every existing
 * ManuscriptNode is deleted, cascading to its Scene) rather than an
 * attempted smart merge: reconciling arbitrary track-changes edits
 * against the existing tree paragraph-by-paragraph is a much harder,
 * riskier problem than "trust the edited file as the new source of
 * truth," which is also what a Word round-trip through an editor
 * actually implies. Everything else about the project (story bible,
 * cover, settings) is untouched. */
export async function replaceProjectFromDocx(projectId: string, storagePath: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const chapters = await downloadAndParse(storagePath, project.title || "Chapter 1");

  await prisma.$transaction([
    prisma.manuscriptNode.deleteMany({ where: { projectId, parentId: null } }),
  ]);
  await writeChaptersToProject(projectId, chapters);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/format`);
  redirect(`/projects/${projectId}`);
}
