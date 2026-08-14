"use client";

import { useState } from "react";
import Link from "next/link";
import PageHeading from "@/components/dashboard/PageHeading";
import PaymentForm from "@/components/dashboard/PaymentForm";
import BillPreview from "@/components/dashboard/BillPreview";

type View = "list" | "pending" | "received" | "letter" | "summary" | "savings" | "payment" | "paid";

const stats = [
  { label: "Bill Analyzed", value: "1" },
  { label: "Errors Detected", value: "2" },
  { label: "Savings Found", value: "$2590" },
  { label: "Appeal Generated", value: "1" },
];

const files = [
  { name: "Crown Med Hosp...", size: "205kb", status: "Uploaded" },
  { name: "Appeal Letter 1", size: "205kb", status: "Sent" },
];

const caseRows = [
  { bill: "Crown Med Hosp...", provider: "Crown health...", date: "Jul 14, 2026", appeal: "Sent", response: "Received", savings: "$2,345" },
  { bill: "Crown Med Hosp...", provider: "Crown health...", date: "Jul 14, 2026", appeal: "Sent", response: "Pending", savings: "..........." },
  { bill: "Crown Med Hosp...", provider: "Crown health...", date: "Jul 14, 2026", appeal: "Sent", response: "Pending", savings: "..........." },
  { bill: "Crown Med Hosp...", provider: "Crown health...", date: "Jul 14, 2026", appeal: "Sent", response: "Pending", savings: "..........." },
];

export default function ActiveCasePage() {
  const [view, setView] = useState<View>("list");

  if (view === "list") {
    return (
      <div>
        <PageHeading title="Active Case" />
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
              {caseRows.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => setView(row.response === "Received" ? "received" : "pending")}
                  className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                >
                  <td className="flex items-center gap-2 px-4 py-3">
                    <span className="text-accent-500">📄</span>
                    {row.bill}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.provider}</td>
                  <td className="px-4 py-3 text-gray-600">{row.date}</td>
                  <td className="px-4 py-3 font-medium text-primary-600">{row.appeal}</td>
                  <td className={`px-4 py-3 font-medium ${row.response === "Received" ? "text-primary-600" : "text-accent-600"}`}>
                    {row.response}
                  </td>
                  <td className="px-4 py-3 text-gray-800">{row.savings}</td>
                  <td className="px-4 py-3 text-gray-400">⋮</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              <button type="button" className="rounded-full border border-primary-600 px-4 py-2 text-xs font-semibold text-primary-700">
                ⬇ Download as PDF
              </button>
            </div>
            <div className="mt-4">
              <BillPreview />
            </div>
          </div>
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold uppercase tracking-wide text-primary-700">Adjusted Bill</p>
              <button type="button" className="rounded-full border border-primary-600 px-4 py-2 text-xs font-semibold text-primary-700">
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
            <button
              type="button"
              onClick={() => setView("payment")}
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
    return (
      <div>
        <PageHeading title="Active Case" />
        <div className="rounded-2xl bg-white p-6 shadow-sm">
          <PaymentForm
            lineItems={[
              { label: "Adjusted Bill", value: "$5,000" },
              { label: "Charges", value: "$1,000" },
            ]}
            total="$1,000"
            onConfirm={() => setView("paid")}
          />
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
          {files.map((file) => (
            <div
              key={file.name}
              className="flex items-center justify-between border-b border-gray-50 py-3 last:border-0"
            >
              <div className="flex items-center gap-3">
                <span className="text-accent-500">📄</span>
                <div>
                  <p className="text-sm font-medium text-gray-800">{file.name}</p>
                  <p className="flex items-center gap-1 text-xs text-gray-400">
                    {file.size}
                    <span className="text-primary-600">✓ {file.status}</span>
                  </p>
                </div>
              </div>
              <button type="button" className="text-sm font-medium text-primary-600">
                👁 View
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {stats.map((stat) => (
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
            onClick={() => setView("received")}
            className="mt-4 text-xs text-gray-300 hover:text-gray-400"
          >
            (dev) simulate provider response
          </button>
        )}

        {view === "letter" && (
          <div className="mt-4 rounded-xl border border-gray-100 p-6 text-sm leading-relaxed text-gray-700">
            <p className="text-right text-gray-500">
              Dave J. Collins
              <br />
              Crown Med Hospital Center
              <br />
              July 14, 2026
            </p>
            <p className="mt-6">The Billing Manager,</p>
            <p className="mt-4">
              I am writing regarding the itemized bill from Crown Med Hospital Center dated
              July 14, 2026. Our review identified 2 billing discrepancies, including a
              mathematical error and an insurance coverage error, resulting in an
              overcharge of $5,590. We request a corrected statement reflecting an adjusted
              balance of $2,500.
            </p>
            <p className="mt-4">We look forward to your response.</p>
            <p className="mt-6">
              Yours faithfully,
              <br />
              Dave J. Collins
            </p>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                className="rounded-full border border-primary-600 px-5 py-2 text-sm font-semibold text-primary-700"
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
                The provider has acknowledged the mathematical error and insurance coverage
                discrepancy identified in your bill. They have agreed to adjust the total
                charge from $5,590 to $2,500, reflecting a correction of the duplicate lab
                fee and the misclassified insurance rate.
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
