import { getProjectData } from "@/lib/actions/manuscript";
import { ProjectWorkspace } from "@/components/manuscript/ProjectWorkspace";
import type { ManuscriptNodeData, SceneData } from "@/lib/manuscript-tree";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const { project, nodes, characters } = await getProjectData(projectId);

  const mappedNodes: ManuscriptNodeData[] = nodes.map((n) => ({
    id: n.id,
    projectId: n.projectId,
    parentId: n.parentId,
    type: n.type,
    title: n.title,
    orderIndex: n.orderIndex,
    scene: n.scene
      ? ({
          id: n.scene.id,
          content: n.scene.content,
          wordCount: n.scene.wordCount,
          povCharacterId: n.scene.povCharacterId,
          locationId: n.scene.locationId,
          storyDate: n.scene.storyDate,
          status: n.scene.status,
          purpose: n.scene.purpose,
          plotline: n.scene.plotline,
          notes: n.scene.notes,
          targetWordCount: n.scene.targetWordCount,
          characterIds: n.scene.characterIds,
        } as SceneData)
      : null,
  }));

  return (
    <ProjectWorkspace
      projectId={project.id}
      projectTitle={project.title}
      initialNodes={mappedNodes}
      characters={characters}
    />
  );
}
