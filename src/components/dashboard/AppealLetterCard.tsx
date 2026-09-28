"use client";

import { useRef, useState } from "react";
import Modal from "@/components/dashboard/Modal";
import { toggleBullets, toggleWrap, type Selection } from "@/lib/letterFormat";

export type AppealLetterData = {
  caseId: string;
  text: string | null;
  providerEmail: string | null;
  sentAt: string | null;
  // Set while the case is still in progress; null once it's completed, so
  // the finished letter downloads clean.
  watermark?: string | null;
};

export default function AppealLetterCard({ letter }: { letter: AppealLetterData }) {
  const [revealed, setRevealed] = useState(Boolean(letter.sentAt));
  const [text, setText] = useState(letter.text ?? "");
  const [savedText, setSavedText] = useState(letter.text ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sent, setSent] = useState<{ email: string; at: string } | null>(
    letter.sentAt && letter.providerEmail ? { email: letter.providerEmail, at: letter.sentAt } : null,
  );
  const [sendOpen, setSendOpen] = useState(false);
  const [providerEmail, setProviderEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const readOnly = Boolean(sent);

  function applyFormat(fn: (s: Selection) => Selection) {
    const el = textareaRef.current;
    if (!el || readOnly) return;
    const next = fn({ value: text, start: el.selectionStart, end: el.selectionEnd });
    setText(next.value);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(next.start, next.end);
    });
  }

  async function saveIfChanged() {
    if (readOnly || text === savedText || !text.trim()) return;
    setSaveState("saving");
    const res = await fetch(`/api/dashboard/cases/${letter.caseId}/appeal-letter`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (res.ok) {
      setSavedText(text);
      setSaveState("saved");
    } else {
      setSaveState("error");
    }
  }

  async function downloadPdf() {
    setDownloadError(null);
    try {
      const { buildLetterPdf } = await import("@/lib/letterPdf");
      const bytes = await buildLetterPdf(text, letter.watermark ?? null);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "appeal-letter.pdf";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setDownloadError("We couldn't create the PDF. Please try again.");
    }
  }

  async function sendLetter() {
    setSendError(null);
    setSending(true);
    const res = await fetch(`/api/dashboard/cases/${letter.caseId}/send-letter`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerEmail, text }),
    });
    setSending(false);
    if (res.ok) {
      setSent({ email: providerEmail.trim(), at: new Date().toISOString() });
      setSavedText(text);
      setSendOpen(false);
      return;
    }
    const body = await res.json().catch(() => null);
    setSendError(body?.error ?? "We couldn't send the letter. Please try again.");
  }

  const outlineButton =
    "flex items-center gap-2 rounded-full border border-[#0f7545] px-5 py-2 text-sm font-semibold text-[#0f7545] hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="mt-6 rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-lg font-bold text-[#0f7545]">Appeal Letter</p>
          <p className="mt-1 text-sm text-gray-500">Generate your letter to negotiate on the errors found</p>
        </div>

        {!revealed ? (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            disabled={!letter.text}
            title={letter.text ? undefined : "Your letter isn't ready yet"}
            className="rounded-full bg-[#0f7545] px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Generate Appeal Letter
          </button>
        ) : (
          <div className="flex gap-3">
            <button type="button" onClick={downloadPdf} className={outlineButton}>
              ⬇ Download as PDF
            </button>
            <button type="button" onClick={() => setSendOpen(true)} disabled={readOnly} className={outlineButton}>
              ✉ {readOnly ? "Letter Sent" : "Send Letter"}
            </button>
          </div>
        )}
      </div>

      {revealed && (
        <div className="mt-5">
          <div className="flex items-center gap-1 rounded-t-lg bg-gray-100 px-3 py-2">
            <button
              type="button"
              aria-label="Bold"
              disabled={readOnly}
              onClick={() => applyFormat((s) => toggleWrap(s, "**"))}
              className="h-8 w-8 rounded text-sm font-bold text-gray-800 hover:bg-gray-200 disabled:opacity-40"
            >
              B
            </button>
            <button
              type="button"
              aria-label="Italic"
              disabled={readOnly}
              onClick={() => applyFormat((s) => toggleWrap(s, "*"))}
              className="h-8 w-8 rounded text-sm italic text-gray-800 hover:bg-gray-200 disabled:opacity-40"
            >
              I
            </button>
            <button
              type="button"
              aria-label="Bulleted list"
              disabled={readOnly}
              onClick={() => applyFormat(toggleBullets)}
              className="h-8 w-8 rounded text-sm text-gray-800 hover:bg-gray-200 disabled:opacity-40"
            >
              ≡
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={text}
            readOnly={readOnly}
            onChange={(e) => setText(e.target.value)}
            onBlur={saveIfChanged}
            aria-label="Appeal letter"
            rows={18}
            className="w-full rounded-b-lg border border-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-700 focus:border-primary-400 focus:outline-none"
          />
          <div className="mt-2 min-h-5 text-xs">
            {readOnly && sent && (
              <p className="text-primary-600">
                Sent to {sent.email} on{" "}
                {new Date(sent.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
              </p>
            )}
            {!readOnly && saveState === "saving" && <p className="text-gray-400">Saving…</p>}
            {!readOnly && saveState === "saved" && <p className="text-primary-600">Saved.</p>}
            {!readOnly && saveState === "error" && (
              <p className="text-danger">Couldn&apos;t save your changes. They&apos;ll be kept here until you leave the page.</p>
            )}
            {downloadError && <p className="text-danger">{downloadError}</p>}
          </div>
        </div>
      )}

      {sendOpen && (
        <Modal onClose={() => setSendOpen(false)}>
          <h2 className="font-serif text-xl font-bold text-gray-900">Send your appeal letter</h2>
          <p className="mt-2 text-sm text-gray-500">
            Enter your provider&apos;s billing department email. Replies will come to your own email address.
          </p>
          <input
            type="email"
            value={providerEmail}
            onChange={(e) => setProviderEmail(e.target.value)}
            placeholder="billing@provider.com"
            aria-label="Provider email"
            className="mt-4 w-full rounded-full border border-gray-200 px-5 py-3 text-sm focus:border-primary-400 focus:outline-none"
          />
          {sendError && <p className="mt-3 text-sm text-danger">{sendError}</p>}
          <button
            type="button"
            onClick={sendLetter}
            disabled={sending || !providerEmail.trim()}
            className="mt-5 w-full rounded-full bg-[#0f7545] py-3 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </Modal>
      )}
    </div>
  );
}
