"use client";

import { useState } from "react";
import type { BillDocument } from "@/lib/billDocuments";

export type UploadRow = {
  id: string;
  customer: string;
  filename: string;
  providerName: string | null;
  status: string;
  uploadedAt: string;
  doc: BillDocument | null;
};

export default function UploadsTable({ uploads }: { uploads: UploadRow[] }) {
  const [selected, setSelected] = useState<UploadRow | null>(null);

  return (
    <>
      <div className="rounded-2xl bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Customer Upload</h2>
        </div>

        {uploads.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No uploads yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  <th className="py-3 pr-4">SN</th>
                  <th className="py-3 pr-4">Customer</th>
                  <th className="py-3 pr-4">File</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Date of Upload</th>
                  <th className="py-3">Time</th>
                </tr>
              </thead>
              <tbody>
                {uploads.map((u, i) => {
                  const uploaded = new Date(u.uploadedAt);
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelected(u)}
                      className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                    >
                      <td className="py-3 pr-4 text-gray-500">{String(i + 1).padStart(3, "0")}</td>
                      <td className="py-3 pr-4 text-gray-800">{u.customer}</td>
                      <td className="py-3 pr-4 text-gray-500">{u.filename}</td>
                      <td className="py-3 pr-4 capitalize text-gray-500">{u.status}</td>
                      <td className="py-3 pr-4 text-gray-500">
                        {uploaded.toLocaleDateString("en-US", { day: "2-digit", month: "long" })}
                      </td>
                      <td className="py-3 text-gray-500">
                        {uploaded.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-xl rounded-2xl bg-white p-8 shadow-xl">
            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute right-6 top-6 text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
            <h2 className="font-serif text-2xl font-bold text-gray-900">Customer Upload</h2>

            <div className="mt-6 grid grid-cols-3 gap-6 text-sm">
              <div>
                <p className="text-gray-400">Customer</p>
                <p className="mt-1 font-medium text-gray-800">{selected.customer}</p>
              </div>
              <div>
                <p className="text-gray-400">Provider</p>
                <p className="mt-1 font-medium text-gray-800">{selected.providerName ?? "—"}</p>
              </div>
              <div>
                <p className="text-gray-400">Status</p>
                <p className="mt-1 font-medium capitalize text-gray-800">{selected.status}</p>
              </div>
              <div>
                <p className="text-gray-400">Date</p>
                <p className="mt-1 font-medium text-gray-800">
                  {new Date(selected.uploadedAt).toLocaleDateString("en-US", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              </div>
              <div>
                <p className="text-gray-400">Time</p>
                <p className="mt-1 font-medium text-gray-800">
                  {new Date(selected.uploadedAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">File</p>
                <p className="mt-1 text-sm font-medium text-gray-800">{selected.filename}</p>
              </div>
              {selected.doc?.downloadUrl && (
                <a
                  href={selected.doc.downloadUrl}
                  className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  ⬇ Download
                </a>
              )}
            </div>

            <div className="mt-4 max-h-64 max-w-[220px] overflow-hidden rounded-xl">
              {selected.doc?.previewUrl ? (
                selected.doc.isImage ? (
                  <a href={selected.doc.previewUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={selected.doc.previewUrl}
                      alt={selected.filename}
                      className="aspect-[3/4] w-full rounded-xl border border-gray-100 object-cover"
                    />
                  </a>
                ) : (
                  <a
                    href={selected.doc.previewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 bg-gray-50 p-4 text-center text-xs text-gray-500 hover:bg-gray-100"
                  >
                    <span>View file</span>
                  </a>
                )
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-xl border border-dashed border-gray-200 p-4 text-center text-xs text-gray-400">
                  File unavailable
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
