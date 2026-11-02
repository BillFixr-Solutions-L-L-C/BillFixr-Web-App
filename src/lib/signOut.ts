import type { SupabaseClient } from "@supabase/supabase-js";

// The one way out of the app. Every sign-out goes through here so the
// logout gets recorded — there are five places that sign out (the
// customer logout page, the shared button, the admin sidebar, the admin
// idle timeout, and account deletion), and a new one that forgot to
// record would simply be invisible rather than broken.
//
// Recording is best effort and deliberately cannot block the sign-out:
// if the stamp fails, times out, or the user is offline, they still get
// signed out. Being unable to note that someone left is never a reason
// to keep them logged in.
export async function signOutAndRecord(supabase: SupabaseClient): Promise<void> {
  try {
    await fetch("/api/auth/record-logout", { method: "POST", keepalive: true });
  } catch {
    // Offline, or the request was cut short by the navigation that
    // usually follows. Nothing to do about it, and nothing worth saying.
  }
  await supabase.auth.signOut();
}
