import type { SupabaseClient } from "@supabase/supabase-js";

// Telling the team something happened that they have to act on.
//
// The notifications table and the admin bell have existed since the
// beginning, and only two things ever wrote to it: a new support ticket,
// and a live chat message. Both are the customer knocking on the door.
// Nothing told the team about the things that actually stall a case —
// above all a settlement the engine has parked because a finding needs a
// person to check it, which is a case that cannot finish until somebody
// opens that exact page.
//
// Deliberately written in TypeScript next to the code that learns the
// fact, rather than as another database trigger. The two existing ones
// fire on an INSERT into a table; "the provider replied" is not an insert
// anywhere — it is something the engine tells us when we ask it, so the
// only place that can know is the code doing the asking.

export type AdminNotificationType = "provider_replied" | "settlement_held" | "case_stalled";

/** Which admins to tell. `null` means every admin, as the support-ticket
 *  trigger does; a domain name narrows it to those with full access to
 *  that domain, as the live-chat trigger does for client_data. */
type Audience = { domain: string | null };

export type AdminNotification = {
  type: AdminNotificationType;
  message: string;
} & Audience;

/**
 * Inserts one notification per admin who should see it.
 *
 * Needs the service role: an admin's own client cannot write a row
 * belonging to another admin, and these are written during a customer's
 * request as often as during an admin's.
 *
 * Never throws. A notification is a convenience on top of work that has
 * already happened — the case has already advanced, the email has already
 * gone — and failing that work because the bell could not be rung would
 * be the wrong trade every time.
 */
export async function notifyAdmins(
  admin: SupabaseClient,
  notification: AdminNotification,
): Promise<{ sent: number }> {
  try {
    let query = admin.from("profiles").select("id").eq("role", "admin").eq("status", "active");

    if (notification.domain) {
      // Mirrors the live-chat trigger: only admins with full access to
      // the domain the notice concerns. A finance admin does not need
      // every negotiation event.
      const { data: roleIds } = await admin
        .from("role_domain_access")
        .select("role_id")
        .eq("domain", notification.domain)
        .eq("access_level", "full");
      const ids = (roleIds ?? []).map((r) => r.role_id as string);
      if (ids.length === 0) return { sent: 0 };
      query = query.in("role_id", ids);
    }

    const { data: admins } = await query;
    const recipients = admins ?? [];
    if (recipients.length === 0) return { sent: 0 };

    const { error } = await admin.from("notifications").insert(
      recipients.map((a) => ({
        user_id: a.id as string,
        type: notification.type,
        message: notification.message,
      })),
    );
    if (error) {
      console.error("Could not write admin notifications:", error.message);
      return { sent: 0 };
    }
    return { sent: recipients.length };
  } catch (err) {
    console.error("Could not write admin notifications:", err);
    return { sent: 0 };
  }
}
