"use client";

import { useState } from "react";
import type { BillAnalysis } from "@/lib/billAnalysis";
import type { BillDocument } from "@/lib/billDocuments";

type HeaderField = { label: string; value: string };

export default function DocumentAnalysisClient({
  analysis,
  headerInfo,
  doc,
}: {
  analysis: BillAnalysis;
  headerInfo: HeaderField[];
  doc: BillDocument;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div>
      <h1 className="font-serif text-4xl font-bold text-gray-900">Analysis Complete - Errors Found</h1>
      <p className="mt-2 text-gray-500">We&apos;ve identify potential issues and opportunity to savivings</p>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">AI Bill Analysis</p>
        <p className="mt-3 text-sm leading-relaxed text-gray-500">{analysis.analysisSummary}</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Header Information</p>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-5">
            {headerInfo.map((f) => (
              <div key={f.label}>
                <p className="text-xs text-gray-400">{f.label}</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-700">Files</p>
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
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Errors Found</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{analysis.errorsFound}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Estimated Savings</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{analysis.estimatedSavings}</p>
        </div>
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Detected Issues</p>
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

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-primary-700">Total Amount Breakdown</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                <th className="px-4 py-3" />
                <th className="px-4 py-3">Current</th>
                <th className="px-4 py-3">Original (AI Extracted)</th>
                <th className="px-4 py-3">Difference</th>
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
        </div>
      </div>

      <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-primary-700">Line Items</p>
          <span className="rounded-full bg-danger-bg px-3 py-1 text-xs font-medium text-danger">
            {analysis.lineItems.filter((item) => item.status).length} Error Found
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="bg-primary-50 text-xs font-semibold uppercase tracking-wide text-primary-700">
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">Billed Amount</th>
                <th className="px-4 py-3">Insurance Paid</th>
                <th className="px-4 py-3">Your Responsibility</th>
                <th className="px-4 py-3">Status</th>
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
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Over Billed</p>
            <p className="mt-2 text-xl font-bold text-danger">{analysis.overBilled}</p>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Adjusted Charges</p>
            <p className="mt-2 text-xl font-bold text-primary-600">{analysis.adjustedCharges}</p>
          </div>
        </div>

        <span className="rounded-full bg-primary-600 px-8 py-3 text-sm font-semibold text-white">
          Completed
        </span>
      </div>

      {previewOpen && doc.previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setPreviewOpen(false)}
              aria-label="Close"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <p className="mb-4 text-sm font-semibold text-gray-800">{doc.filename}</p>
            {doc.isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={doc.previewUrl} alt={doc.filename} className="w-full rounded-lg" />
            ) : (
              <a
                href={doc.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-lg border border-gray-100 bg-gray-50 p-8 text-center text-sm text-primary-600 hover:bg-gray-100"
              >
                Open file in new tab
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
