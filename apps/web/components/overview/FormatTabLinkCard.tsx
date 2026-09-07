import Link from "next/link";
import { Wand2 } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

// Export/formatting used to live entirely in a Card here (the old
// ExportCard.tsx) -- per author request (2026-09-07) it moved to its own
// dedicated "Format & Export" project tab, with a live preview pane
// alongside the controls. This is just a small pointer left in its old
// spot so the feature doesn't feel like it vanished from Overview.
export function FormatTabLinkCard({ projectId }: { projectId: string }) {
  return (
    <Card className="flex items-center justify-between gap-4 p-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Format & Export</p>
        <p className="mt-1 text-sm text-muted-foreground">
          EPUB, print-ready PDF, and Word exports, with a live preview as you format -- now its own tab.
        </p>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0">
        <Link href={`/projects/${projectId}/format`}>
          <Wand2 className="size-3.5" />
          Open Format & Export
        </Link>
      </Button>
    </Card>
  );
}
