"use client";

import { useState } from "react";
import PageHeading from "@/components/dashboard/PageHeading";

const seedMessages = [
  { from: "agent", text: "How can i help you?" },
  { from: "user", text: "Am i making payment before i will have access to the new bill adjusted?" },
  { from: "agent", text: "Yes, after your bill has been adjusted.. you will make payment and get the adjust bill." },
];

function Avatar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full bg-gradient-to-br from-accent-300 to-primary-400 ${className}`}
    />
  );
}

export default function SupportPage() {
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <div className="relative">
      <PageHeading title="Support" />

      <div className="space-y-4">
        <select className="w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm text-gray-500 focus:border-primary-400 focus:outline-none">
          <option>Select your complain</option>
          <option>Payment issue</option>
          <option>Case status question</option>
          <option>Document access</option>
          <option>Other</option>
        </select>

        <div>
          <label className="text-sm text-gray-700">Message</label>
          <textarea
            rows={5}
            className="mt-2 w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center justify-end gap-4">
          <button
            type="button"
            className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
          >
            Send
          </button>
          <button type="button" onClick={() => setChatOpen(true)} aria-label="Open live chat">
            <Avatar className="relative h-11 w-11 after:absolute after:bottom-0 after:right-0 after:h-3 after:w-3 after:rounded-full after:bg-primary-600 after:ring-2 after:ring-white" />
          </button>
        </div>
      </div>

      {chatOpen && (
        <div className="absolute bottom-6 right-6 top-6 flex w-full max-w-md flex-col rounded-3xl bg-white/95 p-6 shadow-2xl backdrop-blur">
          <button
            type="button"
            onClick={() => setChatOpen(false)}
            aria-label="Close chat"
            className="self-end text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <div className="flex-1 space-y-4 overflow-y-auto py-4">
            {seedMessages.map((m, i) =>
              m.from === "agent" ? (
                <div
                  key={i}
                  className="ml-auto max-w-[80%] rounded-2xl bg-primary-50 px-4 py-3 text-sm text-primary-800"
                >
                  {m.text}
                </div>
              ) : (
                <div key={i} className="flex items-end gap-2">
                  <Avatar className="h-7 w-7" />
                  <div className="max-w-[75%] rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
                    {m.text}
                  </div>
                </div>
              ),
            )}
          </div>

          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
            <input
              type="text"
              placeholder="How can i help you?"
              className="flex-1 bg-transparent text-sm focus:outline-none"
            />
            <button type="button" aria-label="Voice input" className="text-gray-400">
              🎤
            </button>
            <button
              type="button"
              aria-label="Send"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-white"
            >
              ↑
            </button>
          </div>

          <Avatar className="absolute -bottom-4 -right-4 h-14 w-14 ring-4 ring-white after:absolute after:bottom-0.5 after:right-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-primary-600 after:ring-2 after:ring-white" />
        </div>
      )}
    </div>
  );
}
