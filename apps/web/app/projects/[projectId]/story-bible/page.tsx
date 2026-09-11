import { getProjectMeta, listChapters } from "@/lib/actions/manuscript";
import {
  listCharacters,
  listLocations,
  listStoryBibleEntries,
} from "@/lib/actions/story-bible";
import { listSceneCards } from "@/lib/actions/scene-cards";
import { StoryBibleWorkspace } from "@/components/story-bible/StoryBibleWorkspace";

export default async function StoryBiblePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await getProjectMeta(projectId); // ownership check (layout already fetched this, cheap to repeat)

  const [characters, locations, notes, chapters, sceneCards] = await Promise.all([
    listCharacters(projectId),
    listLocations(projectId),
    listStoryBibleEntries(projectId),
    listChapters(projectId),
    listSceneCards(projectId),
  ]);

  return (
    <StoryBibleWorkspace
      projectId={projectId}
      initialCharacters={characters}
      initialLocations={locations}
      initialNotes={notes}
      initialChapters={chapters}
      initialSceneCards={sceneCards}
    />
  );
}
