import { getProjectOverview, listActionItems } from "@/lib/actions/overview";
import { OverviewWorkspace } from "@/components/overview/OverviewWorkspace";

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [details, actionItems] = await Promise.all([
    getProjectOverview(projectId),
    listActionItems(projectId),
  ]);

  return (
    <OverviewWorkspace
      projectId={projectId}
      initialDetails={details}
      initialActionItems={actionItems}
    />
  );
}
