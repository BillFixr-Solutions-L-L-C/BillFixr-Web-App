"use client";

import { useState } from "react";
import RevenueChart from "@/components/admin/RevenueChart";
import DonutChart from "@/components/admin/DonutChart";

const processes = [
  { title: "Claim OCR Pipeline", detail: "OCR: 98% complete, Agent: ACtive, Generator: Pending" },
  { title: "Risk Assessment Agent", detail: "OCR: 98% complete, Agent: ACtive, Generator: Pending" },
  { title: "Claim OCR Pipeline", detail: "OCR: 98% complete, Agent: ACtive, Generator: Pending" },
  { title: "Risk Assessment Agent", detail: "OCR: 98% complete, Agent: ACtive, Generator: Pending" },
  { title: "Claim OCR Pipeline", detail: "OCR: 98% complete, Agent: ACtive, Generator: Pending" },
  { title: "Risk Assessment Agent", detail: "OCR: 98% complete, Agent: ACtive, Generator: Pending" },
];

const initialFailedTasks = [
  { workflow: "Claim 7536", caseId: "7536", error: "OCR", timestamp: "AUG 26,2026" },
  { workflow: "Claim 7536", caseId: "7536", error: "OCR", timestamp: "AUG 26,2026" },
];

const logs = [
  { timestamp: "12:09:098", step: "Claim 7536 OCR Time-out" },
  { timestamp: "12:09:098", step: "Claim 7536 OCR Time-out" },
  { timestamp: "12:09:098", step: "Claim 7536 OCR Time-out" },
];

export default function AutomationMonitoringPage() {
  const [failedTasks, setFailedTasks] = useState(initialFailedTasks);

  const retry = (index: number) => {
    setFailedTasks((tasks) => tasks.filter((_, i) => i !== index));
  };

  const retryAll = () => {
    setFailedTasks([]);
  };

  return (
    <div>
      <h1 className="mb-6 font-serif text-3xl font-bold text-gray-900">
        Automation Monitoring Dashboard
      </h1>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">Workflow Processes</h2>
          <div className="relative pl-6">
            <div className="absolute bottom-2 left-[7px] top-2 w-px bg-gray-100" />
            <div className="space-y-6">
              {processes.map((p, i) => (
                <div key={i} className="relative">
                  <span className="absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-primary-500 shadow" />
                  <p className="text-sm font-semibold text-gray-900">{p.title}</p>
                  <p className="mt-0.5 text-sm text-gray-500">{p.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">System Health &amp; Reporting</h2>
          <RevenueChart />
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Today&apos;s Status Distribution</h2>
            <DonutChart />
          </div>

          <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold text-gray-900">Failed Tasks &amp; Alerts</h2>
            {failedTasks.length > 0 ? (
              <table className="w-full text-left text-sm">
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
                  {failedTasks.map((t, i) => (
                    <tr key={i} className="border-t border-gray-50">
                      <td className="py-2 pr-4 text-gray-800">
                        {t.workflow}
                        <br />
                        <span className="text-xs text-red-500">OCR Time-out</span>
                      </td>
                      <td className="py-2 pr-4 text-gray-500">{t.caseId}</td>
                      <td className="py-2 pr-4 text-gray-500">{t.error}</td>
                      <td className="py-2 pr-4 text-gray-500">{t.timestamp}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => retry(i)}
                          className="rounded-lg border border-gray-200 px-3 py-1 text-xs hover:bg-gray-50"
                        >
                          Retry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="py-4 text-sm text-gray-400">No failed tasks. Everything&apos;s running clean.</p>
            )}
            {failedTasks.length > 0 && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={retryAll}
                  className="rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white hover:bg-primary-700"
                >
                  Retry ALL
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-sm text-gray-500">System Lead</p>
            <p className="mt-1 text-3xl font-bold text-gray-900">90%</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="mb-2 text-sm font-semibold text-gray-900">System Lead</p>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div className="h-2 w-4/5 rounded-full bg-primary-500" />
            </div>
          </div>

          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Logs &amp; Activity</h2>
            </div>
            <div className="mb-3 flex gap-2">
              <select className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500">
                <option>Filter</option>
              </select>
              <input
                placeholder="Search"
                className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-500"
              />
            </div>
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="py-1.5 pr-2 font-medium">Timestamp</th>
                  <th className="py-1.5 font-medium">Workflow ID-Step</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={i} className="border-t border-gray-50">
                    <td className="py-1.5 pr-2 text-gray-500">{l.timestamp}</td>
                    <td className="py-1.5 text-gray-700">{l.step}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
