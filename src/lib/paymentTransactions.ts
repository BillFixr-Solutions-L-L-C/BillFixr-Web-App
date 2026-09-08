import type { SupabaseClient } from "@supabase/supabase-js";

const STATUS_LABEL: Record<string, string> = {
  paid: "Successful",
  pending: "Processing",
  failed: "Failed",
};

export type PaymentRow = {
  id: string;
  customer: string;
  amount: string;
  date: string;
  time: string;
  status: string;
};

// Real payment_records rows, mapped into the shape PaymentsTable.tsx
// already expects (built for the mock paymentsData.ts, now real) —
// deliberately not changing that component's contract.
export async function getPaymentRows(
  supabase: SupabaseClient,
  type: "commitment_fee" | "success_fee",
  limit = 20,
): Promise<PaymentRow[]> {
  const { data } = await supabase
    .from("payment_records")
    .select("id, amount, status, created_at, profiles!payment_records_user_id_fkey(name)")
    .eq("type", type)
    .order("created_at", { ascending: false })
    .limit(limit);

  type Row = {
    id: string;
    amount: number;
    status: string;
    created_at: string;
    profiles: { name: string } | null;
  };

  return ((data ?? []) as unknown as Row[]).map((row) => {
    const created = new Date(row.created_at);
    return {
      id: `#${row.id.slice(0, 8).toUpperCase()}`,
      customer: row.profiles?.name ?? "Unknown",
      amount: `$${Number(row.amount).toFixed(2)}`,
      date: created.toLocaleDateString("en-US", { month: "long", day: "numeric" }),
      time: created.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
      status: STATUS_LABEL[row.status] ?? row.status,
    };
  });
}
