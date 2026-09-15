"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Lets the live-chat widget's "Support is online" indicator work —
// updates profiles.last_seen_at every 60s while mounted. Mounted
// app-wide in AdminShell (not scoped to the Live Chat view) — matches
// how most live-chat tools do this (Intercom/Zendesk/Drift-style team
// presence: "an agent is active in the console"), not a per-conversation
// signal. support_is_online()'s 3-minute freshness window is what keeps
// this reasonably honest about an admin who's actually gone.
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
