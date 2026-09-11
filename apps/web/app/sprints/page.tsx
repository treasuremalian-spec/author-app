import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listMySprints, listPublicSprints } from "@/lib/actions/sprints";
import { listFriends } from "@/lib/actions/friends";
import { SprintsWorkspace } from "@/components/sprints/SprintsWorkspace";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";

export default async function SprintsPage() {
  const [mySprints, publicSprints, friends] = await Promise.all([
    listMySprints(),
    listPublicSprints(),
    listFriends(),
  ]);

  return (
    <div className="min-h-screen px-6 py-10">
      <PresenceHeartbeat />
      <div className="mx-auto max-w-3xl">
        <Link
          href="/library"
          className="mb-6 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to your library
        </Link>

        <div className="mb-8">
          <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Together
          </span>
          <p className="font-display text-3xl italic">Writing sprints</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Race the clock, solo or with friends -- everyone starts and ends together.
          </p>
        </div>

        <SprintsWorkspace initialMySprints={mySprints} initialPublicSprints={publicSprints} friends={friends} />
      </div>
    </div>
  );
}
