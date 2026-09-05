import { Download } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ExportCard({ projectId }: { projectId: string }) {
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Download your manuscript as a real e-book file -- opens in Kindle, Apple Books, Kobo, and more.
        </p>
      </div>
      <Button asChild size="sm">
        <a href={`/projects/${projectId}/export/epub`} download>
          <Download className="size-3.5" />
          Download EPUB
        </a>
      </Button>
    </Card>
  );
}
