import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSearchTerm } from "@/lib/searchFilter";

const STATUS_LABEL: Record<string, string> = {
  paid: "Successful",
  pending: "Processing",
  failed: "Failed",
};

const DISPUTE_STATUS_LABEL: Record<string, string> = {
  needs_response: "Needs Response",
  warning_needs_response: "Needs Response",
  under_review: "Under Review",
  warning_under_review: "Under Review",
  warning_closed: "Closed",
  won: "Won",
  lost: "Lost",
  prevented: "Prevented",
};

export type PaymentRow = {
  id: string;
  recordId: string;
  customer: string;
  amount: string;
  date: string;
  time: string;
  status: string;
  cardLabel: string | null;
  refundableAmount: number;
  refundLabel: string | null;
  disputeLabel: string | null;
  canRefund: boolean;
};

function capitalizeBrand(brand: string): string {
  return brand.charAt(0).toUpperCase() + brand.slice(1);
}

// Real payment_records rows, mapped into the shape PaymentsTable.tsx
// already expects (built for the mock paymentsData.ts, now real) —
// deliberately not changing that component's contract.
export async function getPaymentRows(
  supabase: SupabaseClient,
  type: "commitment_fee" | "success_fee",
  options: { limit?: number; page?: number; search?: string; status?: "paid" | "pending" | "failed" } = {},
): Promise<{ rows: PaymentRow[]; totalCount: number }> {
  const { limit = 20, page = 1, search: rawSearch, status } = options;
  const search = rawSearch ? sanitizeSearchTerm(rawSearch) : "";

  let matchingUserIds: string[] | null = null;
  if (search) {
    const { data: matchingProfiles } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "customer")
      .or(`name.ilike.%${search}%,email.ilike.%${search}%`);
    matchingUserIds = (matchingProfiles ?? []).map((p) => p.id);
  }

  let query = supabase
    .from("payment_records")
    .select(
      "id, amount, status, created_at, card_brand, card_last4, refunded_amount, processor_ref, profiles!payment_records_user_id_fkey(name)",
      { count: "exact" },
    )
    .eq("type", type);

  if (search) {
    if (matchingUserIds!.length === 0) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("user_id", matchingUserIds!);
    }
  }
  if (status) {
    query = query.eq("status", status);
  }

  const from = (page - 1) * limit;
  const { data, count } = await query.order("created_at", { ascending: false }).range(from, from + limit - 1);

  type Row = {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    card_brand: string | null;
    card_last4: string | null;
    refunded_amount: number;
    processor_ref: string | null;
    profiles: { name: string } | null;
  };

  const rows = (data ?? []) as unknown as Row[];

  // A payment realistically has at most one dispute — fetched separately
  // (not joined) so a to-many relationship can't multiply rows, and
  // reduced to the most recent one per payment.
  const disputesByRecordId = new Map<string, { status: string }>();
  if (rows.length > 0) {
    const { data: disputes } = await supabase
      .from("payment_disputes")
      .select("payment_record_id, status, updated_at")
      .in(
        "payment_record_id",
        rows.map((r) => r.id),
      )
      .order("updated_at", { ascending: false });
    for (const d of (disputes ?? []) as { payment_record_id: string; status: string }[]) {
      if (!disputesByRecordId.has(d.payment_record_id)) {
        disputesByRecordId.set(d.payment_record_id, { status: d.status });
      }
    }
  }

  const mapped = rows.map((row) => {
    const created = new Date(row.created_at);
    const amount = Number(row.amount);
    const refundedAmount = Number(row.refunded_amount ?? 0);
    const refundableAmount = Math.max(0, amount - refundedAmount);
    const dispute = disputesByRecordId.get(row.id);

    let refundLabel: string | null = null;
    if (refundedAmount > 0) {
      refundLabel = refundableAmount <= 0 ? "Fully Refunded" : `Partially Refunded ($${refundedAmount.toFixed(2)})`;
    }

    return {
      id: `#${row.id.slice(0, 8).toUpperCase()}`,
      recordId: row.id,
      customer: row.profiles?.name ?? "Unknown",
      amount: `$${amount.toFixed(2)}`,
      date: created.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
      time: created.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      status: STATUS_LABEL[row.status] ?? row.status,
      cardLabel: row.card_brand && row.card_last4 ? `${capitalizeBrand(row.card_brand)} •••• ${row.card_last4}` : null,
      refundableAmount,
      refundLabel,
      disputeLabel: dispute ? (DISPUTE_STATUS_LABEL[dispute.status] ?? dispute.status) : null,
      canRefund: row.status === "paid" && Boolean(row.processor_ref) && refundableAmount > 0,
    };
  });

  return { rows: mapped, totalCount: count ?? 0 };
}
