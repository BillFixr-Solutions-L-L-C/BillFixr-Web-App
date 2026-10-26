import Link from "next/link";
import RevenueChart from "@/components/admin/RevenueChart";
import DonutChart from "@/components/admin/DonutChart";
import RetryStalledCases from "@/components/admin/RetryStalledCases";
import { createClient } from "@/lib/supabase/server";
import { getDomainAccess, hasDomainAccess } from "@/lib/domainAccess";
import AccessRestricted from "@/components/admin/AccessRestricted";
import { COMPLETED_STATUSES } from "@/lib/caseStatus";
import { getAiServiceConfig } from "@/lib/ai-service";
import {
  bucketCountByMonth,
  isStalled,
  pipelineStatusSegments,
  successRate,
  STALLED_AFTER_MINUTES,
} from "@/lib/adminAnalytics";

// Every figure here is measured, not illustrative. The panels that depend
// on the AI service (per-stage OCR/agent progress) say so plainly when it
// isn't connected rather than showing a confident number — a monitoring
// screen that invents its readings is worse than no screen at all.

const THROUGHPUT_MONTHS = 7;
const LOG_LIMIT = 8;

type CaseRow = { id: string; status: string; created_at: string };

function shortId(id: string) {
  return id.slice(0, 8);
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function AutomationMonitoringPage() {
  const supabase = await createClient();

  if (!hasDomainAccess(await getDomainAccess(supabase, "ai_pipeline"))) {
    return (
      <div>
        <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Automation Monitoring Dashboard</h1>
        <AccessRestricted />
      </div>
    );
  }

  const windowStart = new Date();
  windowStart.setMonth(windowStart.getMonth() - (THROUGHPUT_MONTHS - 1), 1);

  const [{ data: openRows }, { count: successCount }, { count: reviewCount }, { data: throughput }, { data: recent }] =
    await Promise.all([
      // Anything still in the pipeline, with the timestamp needed to tell
      // "running" from "stuck".
      supabase.from("cases").select("id, status, created_at").in("status", ["uploaded", "scanning"]),
      supabase.from("cases").select("id", { count: "exact", head: true }).in("status", COMPLETED_STATUSES),
      supabase.from("cases").select("id", { count: "exact", head: true }).eq("status", "analyzed"),
      supabase.from("cases").select("created_at").gte("created_at", windowStart.toISOString()),
      supabase.from("cases").select("id, status, created_at").order("created_at", { ascending: false }).limit(LOG_LIMIT),
    ]);

  const open = (openRows ?? []) as CaseRow[];
  const stalled = open.filter((c) => isStalled(c.status, c.created_at));
  const pending = open.length - stalled.length;

  const segments = pipelineStatusSegments({
    success: successCount ?? 0,
    pending,
    failed: stalled.length,
    reviews: reviewCount ?? 0,
  });
  const rate = successRate(successCount ?? 0, stalled.length);
  const months = bucketCountByMonth(throughput ?? [], THROUGHPUT_MONTHS);
  const aiConnected = Boolean(getAiServiceConfig());
  const logs = (recent ?? []) as CaseRow[];

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">Automation Monitoring Dashboard</h1>

      {!aiConnected && (
        <div className="mb-6 rounded-xl border border-accent-300 bg-accent-300/10 px-4 py-3 text-sm text-accent-600">
          No AI service is connected, so nothing is being processed. The figures below are real, and
          that is why anything that started scanning is counted as stalled.
        </div>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Workflow Processes</h2>
          {aiConnected ? (
            <div className="relative pl-6">
              <div className="absolute bottom-2 left-[7px] top-2 w-px bg-gray-100" />
              <div className="space-y-6">
                {open.slice(0, 6).map((c) => (
                  <div key={c.id} className="relative">
                    <span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-primary-500 shadow" />
                    <Link href={`/admin/cases/${c.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
                      Case #{shortId(c.id)}
                    </Link>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {c.status === "scanning" ? "Scanning" : "Awaiting scan"} · started {timeOf(c.created_at)}
                    </p>
                  </div>
                ))}
                {open.length === 0 && <p className="text-sm text-gray-400">Nothing in the pipeline right now.</p>}
              </div>
            </div>
          ) : (
            // Per-stage progress (OCR %, agent, generator) is only knowable
            // from the AI service. Saying so beats inventing percentages.
            <p className="py-4 text-sm text-gray-400">
              Per-stage progress needs the AI service. Set <code>AI_SERVICE_BASE_URL</code> to see
              OCR, agent and generator state here.
            </p>
          )}
        </div>

        <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">System Health &amp; Reporting</h2>
          <p className="-mt-2 mb-3 text-xs text-gray-400">Cases entering the pipeline each month</p>
          <RevenueChart months={months} />
        </div>
      </div>

      <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <div className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Today&apos;s Status Distribution</h2>
            <DonutChart segments={segments} />
          </div>

          <div className="mt-6 min-w-0 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold text-gray-900">Failed Tasks &amp; Alerts</h2>
            <p className="mb-4 text-xs text-gray-400">
              Cases that started scanning more than {STALLED_AFTER_MINUTES} minutes ago and never finished.
            </p>
            {stalled.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        <th className="py-2 pr-4">Workflow</th>
                        <th className="py-2 pr-4">Case ID</th>
                        <th className="py-2 pr-4">Error Code</th>
                        <th className="py-2 pr-4">Timestamp</th>
                        <th className="py-2">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stalled.map((c) => (
                        <tr key={c.id} className="border-t border-gray-50">
                          <td className="py-2 pr-4 text-gray-800">
                            Scan
                            <br />
                            <span className="text-xs text-red-500">No response from the pipeline</span>
                          </td>
                          <td className="py-2 pr-4 text-gray-500">
                            <Link href={`/admin/cases/${c.id}`} className="hover:underline">
                              #{shortId(c.id)}
                            </Link>
                          </td>
                          <td className="py-2 pr-4 text-gray-500">STALLED</td>
                          <td className="py-2 pr-4 text-gray-500">{timeOf(c.created_at)}</td>
                          <td className="py-2">
                            <RetryStalledCases caseIds={[c.id]} label="Retry" compact disabled={!aiConnected} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4">
                  <RetryStalledCases
                    caseIds={stalled.map((c) => c.id)}
                    label="Retry ALL"
                    disabled={!aiConnected}
                  />
                </div>
              </>
            ) : (
              <p className="py-4 text-sm text-gray-400">No stalled cases. Everything&apos;s running clean.</p>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">Success rate</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">{rate === null ? "—" : `${rate}%`}</p>
            <p className="mt-1 text-xs text-gray-400">
              {rate === null ? "Nothing has finished yet" : "Of cases that finished or stalled"}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-gray-900">System Lead</p>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div className="h-2 rounded-full bg-primary-500" style={{ width: `${rate ?? 0}%` }} />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-gray-900">Logs &amp; Activity</h2>
            {logs.length === 0 ? (
              <p className="text-xs text-gray-400">No pipeline activity yet.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-gray-400">
                    <th className="py-1.5 pr-2 font-medium">Timestamp</th>
                    <th className="py-1.5 font-medium">Workflow ID-Step</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((c) => (
                    <tr key={c.id} className="border-t border-gray-50">
                      <td className="py-1.5 pr-2 text-gray-500">{timeOf(c.created_at)}</td>
                      <td className="py-1.5 text-gray-700">
                        #{shortId(c.id)} — {c.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
