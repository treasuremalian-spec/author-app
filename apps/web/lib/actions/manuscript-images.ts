"use server";

// Best-effort bookkeeping for an inline manuscript image -- NOT required
// for the image to actually work (its URL lives directly inside the
// scene's own Tiptap content JSON, saved the normal way through
// SceneEditor's autosave, exactly like every other node type added this
// session). This just records a row in the MediaAsset table, which was
// already in the schema with a SCENE attachment type anticipating exactly
// this feature but had no writer anywhere in the app until now -- gives a
// future "photo library" / asset-management view something to list
// without needing another migration later.
import { prisma } from "@author-app/database";
import { requireUser, assertProjectOwnership } from "@/lib/actions/shared";

export async function recordManuscriptImage(projectId: string, sceneId: string, url: string) {
  const user = await requireUser();
  await assertProjectOwnership(projectId, user.id);

  await prisma.mediaAsset.create({
    data: {
      ownerId: user.id,
      projectId,
      url,
      attachedToType: "SCENE",
      attachedToId: sceneId,
    },
  });
}
