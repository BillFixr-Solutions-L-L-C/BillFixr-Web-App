import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getBillDocuments } from "@/lib/billDocuments";
import { type AdminCaseAnalysis } from "@/lib/adminCaseAnalysis";
import { buildNegotiationTimeline, describeNextStep } from "@/lib/negotiationTimeline";
import type { LetterEvent } from "@/lib/letterTracking";
import { isCaseCompleted } from "@/lib/caseStatus";
import BillDocumentCard from "@/components/admin/BillDocumentCard";
import ManualOverridePanel from "@/components/admin/ManualOverridePanel";
import CaseDocumentsPanel from "@/components/admin/CaseDocumentsPanel";
import { getDomainAccess, hasDomainAccess, hasFullDomainAccess } from "@/lib/domainAccess";
import AccessRestricted from "@/components/admin/AccessRestricted";

const RISK_COLOR: Record<string, string> = {
  High: "text-red-500",
  Medium: "text-accent-600",
  Low: "text-primary-600",
};

export default async function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  if (!hasDomainAccess(await getDomainAccess(supabase, "client_data"))) {
    return <AccessRestricted />;
  }
  const canOverride = hasFullDomainAccess(await getDomainAccess(supabase, "negotiation"));

  const { data: caseRow } = await supabase
    .from("cases")
    .select(
      "id, status, created_at, letter_sent_at, admin_analysis, manual_notes, override_reason, approval_chain, manual_review_status, profiles!cases_user_id_fkey(name), bills(id, filename, storage_url, status, uploaded_at)",
    )
    .eq("id", id)
    .single();

  if (!caseRow) {
    notFound();
  }

  const profile = Array.isArray(caseRow.profiles) ? caseRow.profiles[0] : caseRow.profiles;
  const bill = Array.isArray(caseRow.bills) ? caseRow.bills[0] : caseRow.bills;
  // No mock fallback. This used to fall back to MOCK_ADMIN_CASE_ANALYSIS,
  // which meant every case — and admin_analysis is null on all of them
  // until the AI workstream lands — displayed the same invented OCR
  // values, risk percentages and reply drafts against a real customer's
  // real bill, indistinguishable from findings. An empty panel is useful;
  // a fabricated one an admin might act on is not.
  const analysis = caseRow.admin_analysis as AdminCaseAnalysis | null;
  const [billDoc] = bill ? await getBillDocuments(supabase, [bill]) : [null];
  const delivered = isCaseCompleted(caseRow.status);

  const { data: caseDocuments } = await supabase
    .from("case_documents")
    .select("id, type, filename, created_at, received_on")
    .eq("case_id", id)
    .order("created_at", { ascending: true });

  const { data: letterEvents } = await supabase
    .from("letter_events")
    .select("type, occurred_at")
    .eq("case_id", id);

  // The one panel that can be told truthfully today: these are events
  // that actually happened, not analysis waiting on the AI service.
  const timeline = buildNegotiationTimeline({
    caseCreatedAt: caseRow.created_at,
    letterSentAt: caseRow.letter_sent_at,
    letterEvents: (letterEvents ?? []) as LetterEvent[],
    documents: caseDocuments ?? [],
  });
  const nextStep = describeNextStep({ letterSentAt: caseRow.letter_sent_at, entries: timeline });

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-block text-sm font-medium text-primary-600 hover:text-primary-700">
        ← Back to Dashboard
      </Link>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Case Detail: #{id.slice(0, 8)}</h1>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Case Overview</h2>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs text-gray-400">Client Name</p>
                <p className="text-sm font-medium text-gray-800">{profile?.name ?? "Unknown"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Case ID</p>
                <p className="text-sm font-medium text-gray-800">#{id.slice(0, 8)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Status</p>
                <p className="text-sm font-medium text-gray-800">{delivered ? "Delivered" : "In Progress"}</p>
              </div>
              <span
                className={`rounded-full px-5 py-2 text-sm font-semibold text-white ${delivered ? "bg-primary-600" : "bg-accent-500"}`}
              >
                {delivered ? "Delivered" : "Under Review"}
              </span>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-[1fr_1fr]">
            <div>
              <p className="mb-2 text-sm font-bold uppercase tracking-wide text-primary-700">Original Bill</p>
              {billDoc ? (
                <BillDocumentCard doc={billDoc} label="Original Bill" />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  No bill on file
                </div>
              )}
            </div>

            <div className="flex flex-col gap-6">
              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">OCR Data Extraction</h3>
                {analysis?.ocrDataExtraction?.length ? (
                  <div className="space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
                    {analysis.ocrDataExtraction.map((f) => (
                      <div key={f.label} className="flex justify-between">
                        <span className="text-gray-500">{f.label}</span>
                        <span className="text-gray-800">{f.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-400">
                    Nothing extracted yet — the bill has not been through OCR.
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">AI Analysis &amp; Risk Assessment</h3>
                {analysis?.riskAssessment?.length ? (
                  <div className="space-y-2 text-sm">
                    {analysis.riskAssessment.map((r, i) => (
                      <div key={i} className="flex justify-between">
                        <span className={`font-semibold ${RISK_COLOR[r.level] ?? "text-gray-600"}`}>{r.level}</span>
                        <span className="text-gray-500">{r.label}</span>
                        <span className="text-gray-800">{r.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">
                    No analysis yet. Risk levels appear once the bill has been scanned.
                  </p>
                )}
              </div>

              <div className="rounded-2xl bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-sm font-semibold text-gray-900">Negotiation &amp; Communication</h3>
                {timeline.length === 0 ? (
                  <p className="text-sm text-gray-400">Nothing has happened on this case yet.</p>
                ) : (
                  <div className="relative pl-6">
                    <div className="absolute bottom-2 left-[7px] top-2 w-px bg-gray-100" />
                    <div className="space-y-4">
                      {timeline.map((t, i) => (
                        <div key={i} className="relative flex items-start justify-between gap-2">
                          <span
                            className={`absolute -left-6 top-1 h-3 w-3 rounded-full border-2 border-white shadow ${
                              t.tone === "failed" ? "bg-danger" : t.tone === "waiting" ? "bg-accent-500" : "bg-primary-500"
                            }`}
                          />
                          <div>
                            <p className="text-sm font-semibold text-gray-900">{t.title}</p>
                            {t.subtitle && <p className="text-xs text-gray-400">{t.subtitle}</p>}
                          </div>
                          <span className="shrink-0 text-xs text-gray-400">
                            {new Date(t.date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {nextStep && <p className="mt-4 border-t border-gray-50 pt-3 text-xs text-gray-500">{nextStep}</p>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <ManualOverridePanel
            caseId={id}
            initialNotes={caseRow.manual_notes ?? ""}
            initialOverrideReason={caseRow.override_reason ?? ""}
            initialApprovalChain={caseRow.approval_chain ?? ""}
            initialDecision={caseRow.manual_review_status as "approved" | "rejected" | "escalated" | null}
            canWrite={canOverride}
          />

          <CaseDocumentsPanel caseId={id} existing={caseDocuments ?? []} canWrite={canOverride} />

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Reply Drafts</h2>
            {!analysis?.replyDrafts?.length && (
              <p className="text-xs text-gray-400">No drafts yet — these are written by the AI service.</p>
            )}
            <div className="space-y-3">
              {(analysis?.replyDrafts ?? []).map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-3 border-t border-gray-50 pt-3 first:border-0 first:pt-0">
                  <p className="text-xs text-gray-500">{d}</p>
                  <button
                    type="button"
                    disabled
                    title="Not available yet — reply drafts aren't editable until real AI-generated content exists"
                    className="shrink-0 cursor-not-allowed rounded-lg border border-gray-100 px-3 py-1 text-xs text-gray-300"
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
