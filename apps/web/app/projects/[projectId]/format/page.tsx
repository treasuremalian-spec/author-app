import { getFormatPreviewData } from "@/lib/actions/format";
import { FormatWorkspace } from "@/components/format/FormatWorkspace";

export default async function FormatPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const initialPreview = await getFormatPreviewData(projectId);

  return <FormatWorkspace projectId={projectId} initialPreview={initialPreview} />;
}
