"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeading from "@/components/dashboard/PageHeading";
import PaymentForm from "@/components/dashboard/PaymentForm";
import BillPreview from "@/components/dashboard/BillPreview";
import { createClient } from "@/lib/supabase/client";
import { pollPaymentStatus } from "@/lib/pollPaymentStatus";
import { getBillDocuments, type BillDocument } from "@/lib/billDocuments";

type View = "list" | "pending" | "received" | "letter" | "summary" | "savings" | "payment" | "paid";

type CaseRow = {
  id: string;
  status: string;
  bills: { filename: string; storage_url: string | null; uploaded_at: string } | null;
  errors_detected: number | null;
  savings_found: number | null;
  appeal_letter_text: string | null;
  ai_summary_text: string | null;
};

// Phase 2 (AI) fields — errors_detected/savings_found/appeal_letter_text/
// ai_summary_text are real columns on cases, always null until the AI/OCR
// workstream populates them. These are the exact values shown until then.
const MOCK_ERRORS_DETECTED = "2";
const MOCK_SAVINGS_FOUND = "$2590";
const MOCK_APPEAL_LETTER = `Dave J. Collins
Crown Med Hospital Center
July 14, 2026

The Billing Manager,

I am writing regarding the itemized bill from Crown Med Hospital Center dated July 14, 2026. Our review identified 2 billing discrepancies, including a mathematical error and an insurance coverage error, resulting in an overcharge of $5,590. We request a corrected statement reflecting an adjusted balance of $2,500.

We look forward to your response.

Yours faithfully,
Dave J. Collins`;
const MOCK_AI_SUMMARY =
  "The provider has acknowledged the mathematical error and insurance coverage discrepancy identified in your bill. They have agreed to adjust the total charge from $5,590 to $2,500, reflecting a correction of the duplicate lab fee and the misclassified insurance rate.";

function viewForStatus(status: string): View {
  if (status === "response_received" || status === "resolved" || status === "payment_pending" || status === "paid" || status === "closed") {
    return "received";
  }
  return "pending";
}

export default function ActiveCasePage() {
  const [loading, setLoading] = useState(true);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [view, setView] = useState<View>("list");
  const [billDoc, setBillDoc] = useState<BillDocument | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [chargeAmount, setChargeAmount] = useState<number | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [confirmingPayment, setConfirmingPayment] = useState(false);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("cases")
        .select(
          "id, status, bills(filename, storage_url, uploaded_at), errors_detected, savings_found, appeal_letter_text, ai_summary_text",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setCases((data as unknown as CaseRow[]) ?? []);
      setLoading(false);
    }
    load();
  }, []);

  const selectedCase = cases.find((c) => c.id === selectedCaseId) ?? null;

  useEffect(() => {
    if (!selectedCase?.bills) return;
    const bill = selectedCase.bills;
    const supabase = createClient();
    let cancelled = false;
    getBillDocuments(supabase, [
      { id: selectedCase.id, filename: bill.filename, storage_url: bill.storage_url, status: "uploaded", uploaded_at: bill.uploaded_at },
    ]).then(([doc]) => {
      if (!cancelled) setBillDoc(doc ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedCase]);

  // Key the fetched doc to the currently selected case so switching cases
  // doesn't briefly show the previous case's file while the new fetch is
  // still in flight.
  const activeBillDoc = billDoc?.id === selectedCase?.id ? billDoc : null;

  async function advanceCase(toStatus: "response_received" | "paid") {
    if (!selectedCaseId) return;
    const res = await fetch("/api/dev/advance-case", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: selectedCaseId, toStatus }),
    });
    if (!res.ok) {
      console.error(`Failed to advance case to ${toStatus}:`, await res.text());
      return;
    }
    setCases((prev) => prev.map((c) => (c.id === selectedCaseId ? { ...c, status: toStatus } : c)));
  }

  async function handleSimulateProviderResponse() {
    await advanceCase("response_received");
    setView("received");
  }

  // Real success-fee flow — only actually chargeable once the case has
  // real errors_detected/savings_found (Phase 2/AI territory, always null
  // today). Until then this reliably 409s and the "savings" view's mock
  // amounts stay exactly as they are — that content is Phase 2's, not
  // this step's, to make real.
  async function handlePayWithCard() {
    setPaymentError(null);
    if (!selectedCaseId) return;

    const res = await fetch("/api/payments/create-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "success_fee", caseId: selectedCaseId }),
    });
    const body = await res.json();

    if (!res.ok) {
      setPaymentError(
        res.status === 409
          ? "This case hasn't finished being analyzed yet — payment isn't available until it has."
          : (body?.error ?? "Failed to start payment. Please try again."),
      );
      return;
    }
    if (body.noFeeOwed || body.alreadyPaid) {
      setCases((prev) => prev.map((c) => (c.id === selectedCaseId ? { ...c, status: "paid" } : c)));
      setView("paid");
      return;
    }
    setClientSecret(body.clientSecret);
    setIntentId(body.intentId);
    setChargeAmount(body.amount ?? null);
    setView("payment");
  }

  async function handlePaymentConfirmed() {
    setConfirmingPayment(true);
    setPaymentError(null);
    if (!intentId) {
      setConfirmingPayment(false);
      return;
    }

    const result = await pollPaymentStatus(intentId);
    setConfirmingPayment(false);

    if (result.status === "failed") {
      setPaymentError("Payment failed. Please try again.");
      return;
    }
    if (result.status === "pending") {
      setPaymentError("Still confirming your payment — please wait a moment and try again.");
      return;
    }

    setCases((prev) => prev.map((c) => (c.id === selectedCaseId ? { ...c, status: "paid" } : c)));
    setView("paid");
  }

  if (loading) {
    return (
      <div>
        <PageHeading title="Active Case" />
        <p className="text-sm text-gray-400">Loading…</p>
      </div>
    );
  }

  if (view === "list") {
    return (
      <div>
        <PageHeading title="Active Case" />
        {cases.length === 0 ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-gray-500 shadow-sm">
            No active cases yet. Upload a bill from your dashboard to get started.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                  <th className="px-4 py-3">Bill</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Upload Date</th>
                  <th className="px-4 py-3">Appeal Letter</th>
                  <th className="px-4 py-3">Provider Response</th>
                  <th className="px-4 py-3">Savings</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {cases.map((row) => {
                  const responseLabel = viewForStatus(row.status) === "received" ? "Received" : "Pending";
                  return (
                    <tr
                      key={row.id}
                      onClick={() => {
                        setSelectedCaseId(row.id);
                        setView(viewForStatus(row.status));
                      }}
                      className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                    >
                      <td className="flex items-center gap-2 px-4 py-3">
                        <span className="text-accent-500">📄</span>
                        {row.bills?.filename ?? "Bill"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">Crown health...</td>
                      <td className="px-4 py-3 text-gray-600">
                        {row.bills?.uploaded_at
                          ? new Date(row.bills.uploaded_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium text-primary-600">Sent</td>
                      <td className={`px-4 py-3 font-medium ${responseLabel === "Received" ? "text-primary-600" : "text-accent-600"}`}>
                        {responseLabel}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {responseLabel === "Received" ? "$2,345" : "..........."}
                      </td>
                      <td className="px-4 py-3 text-gray-400">⋮</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (view === "savings") {
    return (
      <div>
        <PageHeading title="Savings & Payment" />
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-wide text-primary-700">Original Bill</p>
              {activeBillDoc?.downloadUrl ? (
                <a
                  href={activeBillDoc.downloadUrl}
                  className="rounded-full border border-primary-600 px-4 py-2 text-xs font-semibold text-primary-700"
                >
                  ⬇ Download as PDF
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title="Original bill file unavailable"
                  className="cursor-not-allowed rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-400"
                >
                  ⬇ Download as PDF
                </button>
              )}
            </div>
            <div className="mt-4">
              <BillPreview />
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-wide text-primary-700">Adjusted Bill</p>
              <button
                type="button"
                disabled
                title="Available once your appeal negotiation produces an adjusted bill"
                className="cursor-not-allowed rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-400"
              >
                ⬇ Download as PDF
              </button>
            </div>
            <div className="mt-4">
              <BillPreview />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Adjusted Charges</p>
            <p className="mt-2 text-2xl font-bold text-primary-600">$2500</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">
              Please note the 20% of the adjusted bill will charged for services
            </p>
            {paymentError && <p className="mt-2 max-w-xs text-xs text-danger">{paymentError}</p>}
            <button
              type="button"
              onClick={handlePayWithCard}
              className="mt-2 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Pay with Card
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === "payment") {
    const total = chargeAmount != null ? `$${chargeAmount.toFixed(2)}` : "$1,000";
    return (
      <div>
        <PageHeading title="Active Case" />
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {clientSecret ? (
            <>
              <PaymentForm
                clientSecret={clientSecret}
                lineItems={[{ label: "Success fee", value: total }]}
                total={total}
                onSuccess={handlePaymentConfirmed}
              />
              {confirmingPayment && (
                <p className="mt-3 text-center text-sm text-gray-500">Confirming your payment…</p>
              )}
              {paymentError && <p className="mt-3 text-center text-sm text-danger">{paymentError}</p>}
            </>
          ) : (
            <p className="py-10 text-center text-sm text-gray-400">Loading payment form…</p>
          )}
        </div>
      </div>
    );
  }

  if (view === "paid") {
    return (
      <div>
        <PageHeading title="Active Case" />
        <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
          <p className="text-2xl font-bold text-primary-700">Payment Successful</p>
          <p className="mt-2 text-sm text-gray-500">
            Your case is now closed. Full documents are unlocked and ready to download.
          </p>
          <Link
            href="/testimonial"
            className="mt-6 inline-flex rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Rate our services
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeading title="Active Case" />

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-50 py-3 last:border-0">
            <div className="flex items-center gap-3">
              <span className="text-accent-500">📄</span>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {selectedCase?.bills?.filename ?? "Original bill"}
                </p>
                {activeBillDoc?.previewUrl && <p className="text-xs text-primary-600">✓ Uploaded</p>}
              </div>
            </div>
            {activeBillDoc?.previewUrl ? (
              <div className="flex shrink-0 items-center gap-4">
                <a href={activeBillDoc.previewUrl} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-primary-600">
                  👁 View
                </a>
                {activeBillDoc.downloadUrl && (
                  <a href={activeBillDoc.downloadUrl} className="text-sm font-medium text-primary-600">
                    ⬇ Download
                  </a>
                )}
              </div>
            ) : (
              <span className="text-sm text-gray-400">Unavailable</span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Bill Analyzed", value: "1" },
            {
              label: "Errors Detected",
              value: selectedCase?.errors_detected != null ? String(selectedCase.errors_detected) : MOCK_ERRORS_DETECTED,
            },
            {
              label: "Savings Found",
              value: selectedCase?.savings_found != null ? `$${selectedCase.savings_found}` : MOCK_SAVINGS_FOUND,
            },
            { label: "Appeal Generated", value: "1" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                {stat.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">
              Provider Response
            </p>
            {view === "letter" && (
              <p className="mt-1 text-sm text-gray-400">
                Generate your letter to negotiate on the errors found
              </p>
            )}
          </div>

          {view === "pending" && (
            <span className="text-sm font-medium text-accent-600">Still Pending</span>
          )}
          {view === "received" && (
            <>
              <span className="text-sm font-medium text-primary-600">Received</span>
              <button
                type="button"
                onClick={() => setView("letter")}
                className="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
              >
                View Response
              </button>
            </>
          )}
          {view === "letter" && (
            <button
              type="button"
              onClick={() => setView("summary")}
              className="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Summarize Reply
            </button>
          )}
        </div>

        {view === "pending" && (
          <button
            type="button"
            onClick={handleSimulateProviderResponse}
            className="mt-4 text-xs text-gray-300 hover:text-gray-400"
          >
            (dev) simulate provider response
          </button>
        )}

        {view === "letter" && (
          <div className="mt-4 rounded-xl border border-gray-100 p-6 text-sm leading-relaxed text-gray-700">
            <p className="whitespace-pre-line">{selectedCase?.appeal_letter_text ?? MOCK_APPEAL_LETTER}</p>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                disabled
                title="Available once your appeal letter is generated"
                className="cursor-not-allowed rounded-full border border-gray-200 px-5 py-2 text-sm font-semibold text-gray-400"
              >
                ⬇ Download as PDF
              </button>
            </div>
          </div>
        )}

        {view === "summary" && (
          <>
            <div className="mt-6">
              <p className="text-sm font-semibold text-primary-700">AI Summary of Response</p>
              <p className="mt-3 text-sm text-gray-500">
                {selectedCase?.ai_summary_text ?? MOCK_AI_SUMMARY}
              </p>
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-4">
                <div className="rounded-xl border border-gray-100 px-5 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">Over Billed</p>
                  <p className="mt-1 text-lg font-bold text-red-500">$5590</p>
                </div>
                <div className="rounded-xl border border-gray-100 px-5 py-3">
                  <p className="text-xs uppercase tracking-wide text-gray-400">
                    Adjusted Charges
                  </p>
                  <p className="mt-1 text-lg font-bold text-primary-600">$2500</p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-xs text-gray-400">
                  Please note 20% of the adjusted bill will be charged for services
                </p>
                <button
                  type="button"
                  onClick={() => setView("savings")}
                  className="mt-2 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  Pay with Card
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
