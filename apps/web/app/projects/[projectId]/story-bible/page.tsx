import { getProjectMeta } from "@/lib/actions/manuscript";
import {
  listCharacters,
  listLocations,
  listStoryBibleEntries,
} from "@/lib/actions/story-bible";
import { StoryBibleWorkspace } from "@/components/story-bible/StoryBibleWorkspace";

export default async function StoryBiblePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  await getProjectMeta(projectId); // ownership check (layout already fetched this, cheap to repeat)

  const [characters, locations, notes] = await Promise.all([
    listCharacters(projectId),
    listLocations(projectId),
    listStoryBibleEntries(projectId),
  ]);

  return (
    <StoryBibleWorkspace
      projectId={projectId}
      initialCharacters={characters}
      initialLocations={locations}
      initialNotes={notes}
    />
  );
}
