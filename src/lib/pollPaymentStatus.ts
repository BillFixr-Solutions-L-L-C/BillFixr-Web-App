// Polls GET /api/payments/status after stripe.confirmPayment() resolves,
// waiting for the Stripe webhook (the actual source of truth) to flip the
// payment_records row before the UI moves on — same poll-until-server-
// confirms pattern already used in CheckYourEmail.tsx.
export async function pollPaymentStatus(
  intentId: string,
  { intervalMs = 1500, maxAttempts = 20 }: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<{ status: "paid" | "failed" | "pending"; caseId: string | null }> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const res = await fetch(`/api/payments/status?intentId=${encodeURIComponent(intentId)}`);
    if (res.ok) {
      const body = await res.json();
      if (body.status === "paid" || body.status === "failed") {
        return { status: body.status, caseId: body.caseId ?? null };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return { status: "pending", caseId: null };
}
