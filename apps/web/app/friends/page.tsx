import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { listFriends, listPendingRequests } from "@/lib/actions/friends";
import { FriendsWorkspace } from "@/components/friends/FriendsWorkspace";
import { PresenceHeartbeat } from "@/components/presence/PresenceHeartbeat";

export default async function FriendsPage() {
  const [friends, pending] = await Promise.all([listFriends(), listPendingRequests()]);

  return (
    <div className="min-h-screen bg-muted/30 px-6 py-10">
      <PresenceHeartbeat />
      <div className="mx-auto max-w-4xl">
        <Link
          href="/library"
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to your library
        </Link>

        <div className="mb-8">
          <p className="font-display text-2xl font-semibold">Friends</p>
          <p className="text-sm text-muted-foreground">
            Find other writers, and see who&rsquo;s around for a sprint.
          </p>
        </div>

        <FriendsWorkspace
          initialFriends={friends}
          initialIncoming={pending.incoming}
          initialOutgoing={pending.outgoing}
        />
      </div>
    </div>
  );
}
