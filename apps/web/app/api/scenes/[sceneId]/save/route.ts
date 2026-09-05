// Saves a scene's content (autosave). A plain Route Handler rather than a
// Server Action -- see lib/scene-save.ts for why. Called via fetch() from
// SceneEditor.tsx, not a <form>, so on an expired session this returns a
// real 401 JSON response instead of trying to redirect (a redirect isn't
// something a background fetch() call can usefully act on).
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assertProjectOwnership } from "@/lib/actions/shared";
import { persistSceneContent } from "@/lib/scene-save";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sceneId: string }> }
) {
  const { sceneId } = await params;

  try {
    const body = (await request.json()) as { projectId?: string; content?: unknown };
    const { projectId, content } = body;

    if (!projectId || content === undefined) {
      return NextResponse.json({ error: "Missing projectId or content." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "You've been signed out. Refresh the page and log back in.", unauthorized: true },
        { status: 401 }
      );
    }

    await assertProjectOwnership(projectId, user.id);

    const { wordCount } = await persistSceneContent(sceneId, content, user.id);

    return NextResponse.json({ wordCount });
  } catch (error) {
    console.error("Scene save failed for scene", sceneId, error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
