"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Lets the live-chat widget's "Support is online" indicator work —
// updates profiles.last_seen_at every 60s while an admin has the panel
// open. Purely a presence signal, not tied to activity/idle state
// (AdminIdleTimeout already handles signing an idle admin out — this
// just needs "is the tab open", which still applies right up until that
// happens).
const HEARTBEAT_MS = 60 * 1000;

export default function AdminPresenceHeartbeat() {
  useEffect(() => {
    const supabase = createClient();
    let userId: string | null = null;
    let cancelled = false;

    async function beat() {
      if (cancelled) return;
      if (!userId) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        userId = user?.id ?? null;
        if (!userId) return;
      }
      await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId);
    }

    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return null;
}
