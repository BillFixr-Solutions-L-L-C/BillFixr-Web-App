import type { SupabaseClient } from "@supabase/supabase-js";

// Checked in the signup form so someone using a throwaway address gets a
// clear message instead of a generic database failure. This is UX, not
// the gate — the gate is the trigger on auth.users, since signUp() is
// called straight from the browser and anything client-side can be
// skipped by calling the auth endpoint directly.
//
// Reads the same table the trigger reads, so the two cannot drift.

export function emailDomainOf(email: string): string {
  return email.trim().toLowerCase().split("@")[1] ?? "";
}

export async function isBlockedEmailDomain(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const domain = emailDomainOf(email);
  if (!domain) return false;

  const { data, error } = await supabase
    .from("blocked_email_domains")
    .select("domain")
    .eq("domain", domain)
    .maybeSingle();

  // Never block on a failed lookup: the trigger still enforces it, and
  // refusing a legitimate signup because a query failed is the worse
  // outcome.
  if (error) return false;
  return Boolean(data);
}
