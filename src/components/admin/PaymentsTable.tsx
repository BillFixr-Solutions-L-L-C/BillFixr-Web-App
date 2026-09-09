"use client";

import { useState } from "react";
import IssueRefundControl from "@/components/admin/IssueRefundControl";

type Row = {
  id: string;
  recordId: string;
  customer: string;
  amount: string;
  date: string;
  time: string;
  status: string;
  cardLabel: string | null;
  refundableAmount: number;
  refundLabel: string | null;
  disputeLabel: string | null;
  canRefund: boolean;
};

export default function PaymentsTable({ rows, canIssueRefunds = false }: { rows: Row[]; canIssueRefunds?: boolean }) {
  const [selected, setSelected] = useState<Row | null>(null);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead>
          <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            <th className="py-3 pr-4">SN</th>
            <th className="py-3 pr-4">Order ID</th>
            <th className="py-3 pr-4">Customer</th>
            <th className="py-3 pr-4">Amount</th>
            <th className="py-3 pr-4">Date</th>
            <th className="py-3 pr-4">Time</th>
            <th className="py-3 pr-4">Channel</th>
            <th className="py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              onClick={() => setSelected(row)}
              className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
            >
              <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
              <td className="py-3 pr-4 text-gray-800">{row.id}</td>
              <td className="py-3 pr-4 text-gray-800">{row.customer}</td>
              <td className="py-3 pr-4 text-gray-800">{row.amount}</td>
              <td className="py-3 pr-4 text-gray-500">{row.date}</td>
              <td className="py-3 pr-4 text-gray-500">{row.time}</td>
              <td className="py-3 pr-4 text-gray-500">{row.cardLabel ? "Card" : "—"}</td>
              <td className="py-3">
                <span
                  className={`font-medium ${
                    row.status === "Successful" ? "text-primary-600" : "text-accent-600"
                  }`}
                >
                  {row.status}
                </span>
                {row.refundLabel && <span className="ml-2 text-xs font-medium text-gray-400">{row.refundLabel}</span>}
                {row.disputeLabel && <span className="ml-2 text-xs font-medium text-red-500">Disputed: {row.disputeLabel}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="text-lg font-semibold text-gray-900">Billing Details</h2>
            <p className="mt-1 text-sm text-gray-500">Order {selected.id}</p>

            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <div>
                <p className="font-semibold text-gray-900">Billing Model</p>
                <p className="mt-1 text-sm text-gray-500">One-time, per-case fee</p>
                <p className="text-sm text-gray-500">No recurring subscription</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Customer</p>
                <p className="mt-1 text-sm text-gray-500">{selected.customer}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Payment Method</p>
                <p className="mt-1 text-sm text-gray-500">{selected.cardLabel ?? "Not available"}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Payment Date</p>
                <p className="mt-1 text-sm text-gray-500">
                  {selected.date}, {selected.time}
                </p>
              </div>
              <div>
                <p className="font-semibold text-gray-900">Amount Paid</p>
                <p
                  className={`mt-1 text-sm font-semibold ${
                    selected.status === "Successful" ? "text-primary-600" : "text-accent-600"
                  }`}
                >
                  {selected.amount} · {selected.status}
                </p>
              </div>
              {(selected.refundLabel || selected.disputeLabel) && (
                <div>
                  <p className="font-semibold text-gray-900">Refund / Dispute</p>
                  {selected.refundLabel && <p className="mt-1 text-sm text-gray-500">{selected.refundLabel}</p>}
                  {selected.disputeLabel && <p className="text-sm text-red-500">Disputed: {selected.disputeLabel}</p>}
                </div>
              )}
            </div>

            {canIssueRefunds && selected.canRefund && (
              <div className="mt-6 border-t border-gray-100 pt-4">
                <p className="mb-2 font-semibold text-gray-900">Issue Refund</p>
                <IssueRefundControl
                  paymentRecordId={selected.recordId}
                  refundableAmount={selected.refundableAmount}
                  canRefund={selected.canRefund}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
