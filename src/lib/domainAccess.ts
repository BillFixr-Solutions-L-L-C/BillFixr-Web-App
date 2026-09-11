import type { SupabaseClient } from "@supabase/supabase-js";

export type Domain = "ai_pipeline" | "client_data" | "negotiation" | "finance" | "compliance" | "system" | "hr";
export type AccessLevel = "full" | "limited" | "read_only" | "flagged_only" | "assigned_only" | "none";

export async function getDomainAccess(supabase: SupabaseClient, domain: Domain): Promise<AccessLevel> {
  const { data } = await supabase.rpc("get_domain_access", { p_domain: domain });
  return (data as AccessLevel | null) ?? "none";
}

// Page-level: can this role see this section at all?
export function hasDomainAccess(level: AccessLevel): boolean {
  return level !== "none";
}

// Route-level: can this role perform a write in this domain? Everything
// short of "full" (limited/read_only/flagged_only/assigned_only) is
// treated as read-only — see BACKEND-PLAN.md Step 20 for why this
// collapses 6 levels into a view/write distinction rather than
// implementing each one precisely.
export function hasFullDomainAccess(level: AccessLevel): boolean {
  return level === "full";
}
