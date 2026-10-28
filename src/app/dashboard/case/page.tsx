"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeading from "@/components/dashboard/PageHeading";
import PaymentForm from "@/components/dashboard/PaymentForm";
import BillPreview from "@/components/dashboard/BillPreview";
import WatermarkOverlay from "@/components/dashboard/WatermarkOverlay";
import { createClient } from "@/lib/supabase/client";
import { pollPaymentStatus } from "@/lib/pollPaymentStatus";
import { getBillDocuments, type BillDocument } from "@/lib/billDocuments";
import { buildCaseDocumentRows, type CaseDocumentRow } from "@/lib/caseDocuments";
import { summarizeLetterEvents, describeLetterTracking, type LetterEvent } from "@/lib/letterTracking";
import { COMPLETED_STATUSES } from "@/lib/caseStatus";

// "letter"/"summary" are gone: the provider's reply is a row in the
// document list now, and the route to payment is Check and Proceed.
type View = "list" | "pending" | "received" | "savings" | "payment" | "paid";

type CaseRow = {
  id: string;
  status: string;
  bills: { filename: string; storage_url: string | null; uploaded_at: string; provider_name: string | null } | null;
  errors_detected: number | null;
  savings_found: number | null;
  appeal_letter_text: string | null;
  ai_summary_text: string | null;
  letter_sent_at: string | null;
  adjusted_total: number | null;
};

// Phase 2 (AI) fields — errors_detected/savings_found/appeal_letter_text/
// ai_summary_text are real columns on cases, always null until the AI/OCR
// workstream populates them. These are the exact values shown until then.
const MOCK_ERRORS_DETECTED = "2";
const MOCK_SAVINGS_FOUND = "$2590";

function BackToCasesButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 text-sm font-medium text-primary-600 hover:text-primary-700"
    >
      ← Back to cases
    </button>
  );
}

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
  const [successFeePercentage, setSuccessFeePercentage] = useState(30);

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
      const [{ data }, { data: settings }] = await Promise.all([
        supabase
          .from("cases")
          .select(
            "id, status, bills(filename, storage_url, uploaded_at, provider_name), errors_detected, savings_found, appeal_letter_text, ai_summary_text, letter_sent_at, adjusted_total",
          )
          .eq("user_id", user.id)
          // Completed cases live on their own page (/dashboard/completed).
          // The just-paid confirmation still shows here from local state.
          .not("status", "in", `(${COMPLETED_STATUSES.join(",")})`)
          .order("created_at", { ascending: false }),
        supabase.from("app_settings").select("success_fee_percentage").eq("id", 1).single(),
      ]);
      setCases((data as unknown as CaseRow[]) ?? []);
      if (settings?.success_fee_percentage != null) setSuccessFeePercentage(Number(settings.success_fee_percentage));
      setLoading(false);
    }
    load();
  }, []);

  // Formats the same way admins enter it (e.g. "30" or "27.5"), never a
  // trailing ".00" for the common whole-number case.
  const successFeeLabel = Number.isInteger(successFeePercentage)
    ? String(successFeePercentage)
    : successFeePercentage.toFixed(2);

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

  // Figma's Active Case lists the appeal letter, acknowledgement letter and
  // analysis alongside the bill — not the bill alone. These are the same
  // rows Completed Case and My Document build, so the three screens cannot
  // describe one case differently.
  const [docRows, setDocRows] = useState<CaseDocumentRow[]>([]);
  const [letterEvents, setLetterEvents] = useState<LetterEvent[]>([]);
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    (async () => {
      // Cleared inside the async path, not synchronously in the effect
      // body — react-hooks/set-state-in-effect.
      if (!selectedCase) {
        if (!cancelled) setDocRows([]);
        return;
      }
      const { data: events } = await supabase
        .from("letter_events")
        .select("type, occurred_at")
        .eq("case_id", selectedCase.id);
      if (!cancelled) setLetterEvents((events ?? []) as LetterEvent[]);

      const { data: stored } = await supabase
        .from("case_documents")
        .select("id, type, filename, storage_url, size_bytes, received_on, created_at")
        .eq("case_id", selectedCase.id);
      const rows = await buildCaseDocumentRows(supabase, {
        bill: selectedCase.bills
          ? {
              filename: selectedCase.bills.filename,
              storage_url: selectedCase.bills.storage_url,
              uploaded_at: selectedCase.bills.uploaded_at,
            }
          : null,
        appealLetterText: selectedCase.appeal_letter_text,
        letterSentAt: selectedCase.letter_sent_at,
        hasAnalysis: selectedCase.savings_found != null,
        analysisDate: selectedCase.bills?.uploaded_at ?? null,
        stored: stored ?? [],
      });
      if (!cancelled) setDocRows(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCase]);

  // Whether the provider actually opened the appeal letter (Figma
  // 815:3326) — derived from Resend's webhook events.
  const letterTracking = summarizeLetterEvents(letterEvents, selectedCase?.letter_sent_at ?? null);

  // Figma labels this "ADJUSTED BILL"; the stored type is new_bill.
  const adjustedBillDoc = docRows.find((d) => d.label === "New Bill" && d.available) ?? null;

  // The only way back to the case list from any non-list view — none of
  // them had one before, including mid-payment, so a user who clicked
  // into a case could only leave via the sidebar (which remounts this
  // page from scratch) or browser back (which, since no history entry
  // was pushed for these client-side view changes, leaves the dashboard
  // section entirely instead of just closing the detail view).
  function backToList() {
    setView("list");
    setSelectedCaseId(null);
    setClientSecret(null);
    setIntentId(null);
    setChargeAmount(null);
    setPaymentError(null);
  }

  async function advanceCase(toStatus: "response_received") {
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
                  <th className="px-4 py-3">Proposed Savings</th>
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
                      <td className="px-4 py-3 text-gray-600">{row.bills?.provider_name ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-600">
                        {row.bills?.uploaded_at
                          ? new Date(row.bills.uploaded_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${row.letter_sent_at ? "text-primary-600" : "text-gray-400"}`}
                      >
                        {row.letter_sent_at ? "Sent" : "Not sent"}
                      </td>
                      <td className={`px-4 py-3 font-medium ${responseLabel === "Received" ? "text-primary-600" : "text-accent-600"}`}>
                        {responseLabel}
                      </td>
                      {/* The real figure. This used to print a flat
                          $2,345 for every case with a response, which was
                          indistinguishable from a measurement. */}
                      <td className="px-4 py-3 text-gray-800">
                        {row.savings_found != null
                          ? `$${Number(row.savings_found).toLocaleString()}`
                          : "..........."}
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
        <BackToCasesButton onClick={backToList} />
        <PageHeading title="Active Case" />
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
            <div className="relative mt-4 overflow-hidden">
              <BillPreview />
              <WatermarkOverlay />
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-wide text-primary-700">Adjusted Bill</p>
              <button
                type="button"
                disabled
                title="Available from Completed Case once payment is complete"
                className="cursor-not-allowed rounded-full border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-400"
              >
                ⬇ Download as PDF
              </button>
            </div>
            {/* Blurred until the fee is paid: the adjusted bill is the
                thing being bought, so it is shown enough to see it exists
                and not enough to use. The blur is on the preview itself,
                and there is no download link beside it. */}
            <div className="relative mt-4 overflow-hidden">
              <div className="blur-sm" aria-hidden="true">
                {adjustedBillDoc?.previewUrl ? (
                  <iframe
                    src={adjustedBillDoc.previewUrl}
                    title=""
                    tabIndex={-1}
                    className="pointer-events-none h-[320px] w-full rounded-lg border border-gray-100"
                  />
                ) : (
                  <BillPreview />
                )}
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <p className="rounded-full bg-white/90 px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm">
                  Unlocked once payment is complete
                </p>
              </div>
              <WatermarkOverlay />
            </div>
          </div>
        </div>

        {/* Figma 817:4651 shows the overcharge beside the corrected total,
            not the corrected total alone. */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-4">
            <div className="rounded-xl border border-[#ebebeb] px-5 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[#a6b1bb]">Over Billed</p>
              <p className="mt-1 text-2xl font-bold text-[#d90000]">
                {selectedCase?.savings_found != null
                  ? `$${Number(selectedCase.savings_found).toLocaleString()}`
                  : "—"}
              </p>
            </div>
            <div className="rounded-xl border border-[#ebebeb] px-5 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[#a6b1bb]">Adjusted Charges</p>
              <p className="mt-1 text-2xl font-bold text-[#009966]">
                {selectedCase?.adjusted_total != null
                  ? `$${Number(selectedCase.adjusted_total).toLocaleString()}`
                  : "—"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">
              Please note the {successFeeLabel}% of the adjusted bill will charged for services
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
        <BackToCasesButton onClick={backToList} />
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
        <BackToCasesButton onClick={backToList} />
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
      <BackToCasesButton onClick={backToList} />
      <PageHeading title="Active Case" />

      <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          {docRows.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center justify-between border-b border-gray-50 py-3 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className={doc.available ? "text-accent-500" : "text-gray-300"}>📄</span>
                <div>
                  <p className={`text-sm font-medium ${doc.available ? "text-gray-800" : "text-gray-400"}`}>
                    {doc.label}
                  </p>
                  <p className="text-xs text-gray-400">
                    {doc.available ? doc.status : "Not yet available"}
                    {doc.sizeLabel ? ` · ${doc.sizeLabel}` : ""}
                    {doc.date
                      ? ` · ${new Date(doc.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : ""}
                  </p>
                  {doc.id === "appeal-letter" && letterTracking.sent && (
                    <p
                      // Amber was for "delivered, not opened yet", which
                      // read as something needing attention. Delivery is
                      // just a fact, and since opens stay off it would sit
                      // amber for ever — so only a real failure is coloured
                      // as one, and an open as good news.
                      className={`text-xs ${
                        letterTracking.bounced
                          ? "text-danger"
                          : letterTracking.opened
                            ? "text-primary-600"
                            : "text-gray-500"
                      }`}
                    >
                      {describeLetterTracking(letterTracking)}
                      {letterTracking.lastOpenedAt
                        ? ` · last opened ${new Date(letterTracking.lastOpenedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                        : ""}
                    </p>
                  )}
                </div>
              </div>
              {doc.previewUrl ? (
                <div className="flex shrink-0 items-center gap-4">
                  <a
                    href={doc.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary-600"
                  >
                    👁 View
                  </a>
                  {/* While a case is active everything is view-only — the
                      documents become downloadable once it completes. The
                      exception is the customer's own medical bill, which
                      they uploaded and already hold a copy of. */}
                  {doc.id === "original-bill" && doc.downloadUrl && (
                    <a href={doc.downloadUrl} className="text-sm font-medium text-primary-600">
                      ⬇ Download
                    </a>
                  )}
                </div>
              ) : (
                <span className="text-sm text-gray-400">{doc.available ? "—" : "Pending"}</span>
              )}
            </div>
          ))}
          {docRows.length === 0 && <p className="py-3 text-sm text-gray-400">No documents yet.</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Bill Analyzed", value: "1" },
            {
              label: "Savings Found",
              value: selectedCase?.savings_found != null ? `$${selectedCase.savings_found}` : MOCK_SAVINGS_FOUND,
            },
            {
              label: "Errors Detected",
              value: selectedCase?.errors_detected != null ? String(selectedCase.errors_detected) : MOCK_ERRORS_DETECTED,
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

      {/* The provider's reply is a row in the document list above, not a
          panel repeated underneath it. The route out of this screen is
          "Check and proceed" on the New Bill. */}
      {view === "pending" && (
        <button
          type="button"
          onClick={handleSimulateProviderResponse}
          className="mt-6 text-xs text-gray-300 hover:text-gray-400"
        >
          (dev) simulate provider response
        </button>
      )}

      {/* Figma 817:4455 puts this directly under Provider Response once the
          provider's adjusted bill has arrived. "Check and proceed" is what
          takes the customer to the bill comparison. */}
      {adjustedBillDoc && (
        <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">New Bill</p>
            <span className="text-sm font-medium text-primary-600">Received</span>
            <button
              type="button"
              onClick={() => setView("savings")}
              className="rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Check and Proceed
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
