"use client";

// Keeps the signed-in author's presenceStatus/presenceUpdatedAt fresh
// while they have the app open -- see lib/presence.ts for the full
// design note on why this is a heartbeat rather than a push channel.
// Mount once per authenticated layout. Pass `status="WRITING"` from
// inside the manuscript editor specifically; every other page just uses
// the default ONLINE.
import { useEffect } from "react";

import { setPresence, type PresenceStatusValue } from "@/lib/actions/presence";

const HEARTBEAT_MS = 60 * 1000;

export function PresenceHeartbeat({ status = "ONLINE" }: { status?: PresenceStatusValue }) {
  useEffect(() => {
    void setPresence(status);
    const interval = setInterval(() => {
      void setPresence(status);
    }, HEARTBEAT_MS);
    return () => clearInterval(interval);
  }, [status]);

  return null;
}
