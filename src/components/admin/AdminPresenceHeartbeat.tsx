"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Lets the live-chat widget's "Support is online" indicator work —
// updates profiles.last_seen_at every 60s while mounted. Deliberately
// mounted only inside admin/support's Live Chat detail view (not
// app-wide in AdminShell) so "online" means an admin actually has a
// chat open, not just the admin panel open somewhere.
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
