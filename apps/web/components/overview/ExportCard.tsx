import { Download } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function ExportCard({ projectId }: { projectId: string }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Export</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Download your manuscript as a real e-book file -- opens in Kindle, Apple Books, Kobo, and more.
        </p>
      </div>
      <Button asChild size="sm" className="w-fit">
        <a href={`/projects/${projectId}/export/epub`} download>
          <Download className="size-3.5" />
          Download EPUB
        </a>
      </Button>

      <div className="border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Print-ready PDF</p>
        <p className="mt-1 text-sm text-muted-foreground">
          A real, paginated book layout -- running headers, page numbers, and chapter starts, ready to send to a
          printer. Longer books can take a minute or two to generate, so give it a moment after you click.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <a href={`/projects/${projectId}/export/pdf?trim=6x9`} download>
              <Download className="size-3.5" />
              6&quot; x 9&quot; (trade)
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={`/projects/${projectId}/export/pdf?trim=5x8`} download>
              <Download className="size-3.5" />
              5&quot; x 8&quot; (digest)
            </a>
          </Button>
        </div>
      </div>
    </Card>
  );
}
