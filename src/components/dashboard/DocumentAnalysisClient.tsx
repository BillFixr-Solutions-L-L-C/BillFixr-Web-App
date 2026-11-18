"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BillAnalysis, BillIssue } from "@/lib/billAnalysis";
import type { BillDocument } from "@/lib/billDocuments";
import AppealLetterCard, { type AppealLetterData } from "@/components/dashboard/AppealLetterCard";
import HeaderInformationCard from "@/components/dashboard/HeaderInformationCard";
import WatermarkOverlay from "@/components/dashboard/WatermarkOverlay";
import type { HeaderField } from "@/lib/headerInfo";
import TableScroller from "@/components/TableScroller";
import { useT } from "@/lib/i18n/client";

const PRIORITY_TAG: Record<BillIssue["priority"], string> = {
  High: "bg-danger text-white",
  Medium: "bg-accent-500 text-white",
  Low: "bg-primary-600 text-white",
};

function IssueCard({ issue, index }: { issue: BillIssue; index: number }) {
  const t = useT();
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xl font-bold text-[#003322]">Issue {index + 1}</p>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${PRIORITY_TAG[issue.priority]}`}>
            {issue.priority} Priority
          </span>
          <span className="rounded-full border border-accent-300 px-3 py-1 text-xs font-medium text-gray-700">
            {issue.category}
          </span>
        </div>
        {issue.potentialSavings && (
          <p className="text-[#a6b1bb]">
            {t("analysis.potentialSavings")}{" "}
            <span className="ml-2 text-2xl font-bold text-[#0f7545]">{issue.potentialSavings}</span>
          </p>
        )}
      </div>
      <p className="mt-4 text-base text-gray-900">{issue.summary}</p>
      {issue.evidence.map((line) => (
        <p key={line} className="mt-1 text-sm text-[#a6b1bb]">
          {line}
        </p>
      ))}
    </div>
  );
}

export default function DocumentAnalysisClient({
  analysis,
  headerInfo,
  doc,
  appealLetter = null,
  headerEditBillId = null,
  watermark = false,
  caseId = null,
  canRescan = true,
  rescanHint,
  atDecisionPoint = false,
}: {
  analysis: BillAnalysis;
  headerInfo: HeaderField[];
  doc: BillDocument;
  appealLetter?: AppealLetterData | null;
  headerEditBillId?: string | null;
  watermark?: boolean;
  // Re-scan and Proceed only mean anything once the bill has a case.
  caseId?: string | null;
  // Two re-scans per case; false once both have been used.
  canRescan?: boolean;
  /** What to say about the allowance, from src/lib/rescan.ts. */
  rescanHint?: string;
  /**
   * Whether the customer is still deciding whether to go ahead: the bill
   * is read, the analysis is in front of them, and the commitment fee is
   * not yet paid. That is the only stretch where Re-scan and Proceed mean
   * anything -- re-scanning a case whose dispute letter is already with
   * the provider would replace the analysis the letter was written from,
   * and "Proceed" past the point they already proceeded reads as a step
   * they still have to take.
   *
   * Defaults to false so the page has to be told the customer is at that
   * point. The wrong way round would be to show a live Re-scan button on
   * a case under negotiation because a caller forgot a prop.
   */
  atDecisionPoint?: boolean;
}) {
  const t = useT();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [rescanError, setRescanError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [proceedError, setProceedError] = useState<string | null>(null);
  const router = useRouter();

  // Reads the bill again and replaces the analysis, for when the result
  // looks wrong. The customer has already paid the commitment fee, so this
  // costs them nothing.
  async function rescan() {
    if (!caseId) return;
    setRescanning(true);
    setRescanError(null);
    const res = await fetch("/api/dev/process-with-ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId, force: true }),
    }).catch(() => null);
    setRescanning(false);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setRescanError(body?.error ?? t("rescan.failed"));
      return;
    }
    router.refresh();
  }

  // Proceed is what sends the dispute.
  //
  // It used to be a plain link to the case screen, because the scan had
  // already started the negotiation and the engine had already written to
  // the provider -- so "Proceed" moved the customer to a page about
  // something that had happened without them. Since 2026-11-18 the scan
  // stops at the analysis and nothing leaves the building until this is
  // pressed, which is what makes the Re-scan beside it worth having.
  async function proceed() {
    if (!caseId) return;
    setSending(true);
    setProceedError(null);
    const res = await fetch(`/api/dashboard/cases/${caseId}/negotiation`, {
      method: "POST",
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      setSending(false);
      // The route's own wording where it has some -- it knows which
      // precondition failed, and "add the provider's billing email" is
      // worth more than a generic failure.
      setProceedError(body?.error ?? t("analysis.proceedFailed"));
      return;
    }
    // Not setSending(false): the case screen is being navigated to and
    // the button should stay spent rather than flicker back to Proceed
    // on a page that is about to be replaced.
    router.push("/dashboard/case");
  }

  return (
    <div>
      {/* My Documents lists the customer's own uploads now, so a bill
          with a case is reached from the case and goes back to it. */}
      <Link
        href={caseId ? "/dashboard/case" : "/dashboard/documents"}
        className="mb-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700"
      >
        {caseId ? "← Back to your case" : "← Back to My Documents"}
      </Link>
      <h1 className="font-serif text-4xl font-bold text-gray-900">{t("analysis.completeErrors")}</h1>
      <p className="mt-2 text-gray-500">{t("analysis.completeBody")}</p>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">{t("analysis.aiBillAnalysis")}</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">{analysis.analysisSummary}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <HeaderInformationCard fields={headerInfo} billId={headerEditBillId} />

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">{t("analysis.files")}</p>
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-accent-500">📄</span>
              <div>
                <p className="text-sm font-medium text-gray-800">{doc.filename}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-primary-600">✓ Uploaded</span>
              {doc.previewUrl && (
                <button type="button" onClick={() => setPreviewOpen(true)} className="text-primary-600">
                  👁 View
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("analysis.errorsFound")}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{analysis.errorsFound}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("analysis.estimatedSavings")}</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{analysis.estimatedSavings}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("analysis.detectedIssues")}</p>
          {analysis.detectedIssues.map((issue) => (
            <span
              key={issue}
              className="mt-2 mr-1 inline-block rounded-full bg-danger-bg px-3 py-1 text-xs font-medium text-danger"
            >
              {issue}
            </span>
          ))}
        </div>
      </div>

      {analysis.issues && analysis.issues.length > 0 && (
        <div className="mt-6 space-y-4">
          {analysis.issues.map((issue, i) => (
            <IssueCard key={`${issue.category}-${i}`} issue={issue} index={i} />
          ))}
        </div>
      )}

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-primary-700">{t("analysis.totalBreakdown")}</p>
        <TableScroller className="mt-4">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                <th className="px-4 py-3" />
                <th className="px-4 py-3">{t("analysis.current")}</th>
                <th className="px-4 py-3">{t("analysis.originalExtracted")}</th>
                <th className="px-4 py-3">{t("analysis.difference")}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.amountBreakdown.map((row) => (
                <tr key={row.label} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-gray-600">{row.label}</td>
                  <td className="px-4 py-3 text-gray-800">{row.current}</td>
                  <td className="px-4 py-3 text-gray-800">{row.original}</td>
                  <td className="px-4 py-3 text-gray-800">{row.difference}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary-700">{t("analysis.lineItems")}</p>
          <span className="rounded-full bg-danger-bg px-3 py-1 text-xs font-medium text-danger">
            {analysis.lineItems.filter((item) => item.status).length} Error Found
          </span>
        </div>
        <TableScroller className="mt-4">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">{t("analysis.description")}</th>
                <th className="px-4 py-3">{t("analysis.billedAmount")}</th>
                <th className="px-4 py-3">{t("analysis.insurancePaid")}</th>
                <th className="px-4 py-3">{t("analysis.yourResponsibility")}</th>
                <th className="px-4 py-3">{t("table.status")}</th>
              </tr>
            </thead>
            <tbody>
              {analysis.lineItems.map((item, i) => (
                <tr key={i} className="border-t border-gray-50">
                  <td className="px-4 py-3 text-gray-600">{item.date}</td>
                  <td className="px-4 py-3 text-gray-800">{item.description}</td>
                  <td className="px-4 py-3 text-gray-800">{item.billed}</td>
                  <td className="px-4 py-3 text-gray-800">{item.insurance}</td>
                  <td className="px-4 py-3 text-gray-800">{item.responsibility}</td>
                  <td className="px-4 py-3">
                    {item.status && (
                      <span className="rounded-full bg-danger-bg px-2.5 py-1 text-xs font-medium text-danger">
                        {item.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableScroller>
      </div>

      {appealLetter && <AppealLetterCard letter={appealLetter} />}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("case.overBilled")}</p>
            <p className="mt-2 text-xl font-bold text-danger">{analysis.overBilled}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{t("case.adjustedCharges")}</p>
            <p className="mt-2 text-xl font-bold text-primary-600">{analysis.adjustedCharges}</p>
          </div>
        </div>

        {/* Only while the customer is deciding. Once the commitment fee
            is paid the dispute is running off this analysis, so there is
            nothing here to re-scan or proceed to -- the case screen is
            where that case is followed from then on. A spent allowance
            removes the button rather than disabling it: a dead control
            with a tooltip is worse than no control and a sentence. */}
        {caseId && atDecisionPoint && (
          <div className="flex flex-wrap items-center gap-3">
            {canRescan ? (
              <button
                type="button"
                onClick={rescan}
                disabled={rescanning || sending}
                title={rescanHint}
                className="rounded-full border border-[#0f7545] px-8 py-3 text-sm font-semibold text-[#0f7545] hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {rescanning ? t("rescan.running") : t("rescan.button")}
              </button>
            ) : (
              rescanHint && <p className="max-w-xs text-xs text-gray-400">{rescanHint}</p>
            )}
            <button
              type="button"
              onClick={proceed}
              disabled={sending || rescanning}
              className="rounded-full bg-[#0f7545] px-8 py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {sending ? t("analysis.sending") : t("analysis.proceed")}
            </button>
          </div>
        )}
      </div>

      {rescanError && <p className="mt-3 text-right text-sm text-danger">{rescanError}</p>}
      {proceedError && <p className="mt-3 text-right text-sm text-danger">{proceedError}</p>}

      {previewOpen && doc.previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label={t("common.close")}
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <p className="mb-4 text-sm font-semibold text-gray-800">{doc.filename}</p>
            {doc.isImage ? (
              <span className="relative block overflow-hidden rounded-lg">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={doc.previewUrl} alt={doc.filename} className="w-full rounded-lg" />
                {watermark && <WatermarkOverlay />}
              </span>
            ) : (
              <a
                href={doc.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-gray-100 bg-gray-50 p-8 text-center text-sm text-primary-600 hover:bg-gray-100"
              >
                {t("analysis.openInNewTab")}
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
