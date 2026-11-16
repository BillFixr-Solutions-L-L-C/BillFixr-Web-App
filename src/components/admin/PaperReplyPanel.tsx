"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

// Getting a reply into the system that did not arrive by email.
//
// Providers answer on headed paper and by fax, and some ring instead of
// writing. None of that reaches the engine's inbox, so until now those
// replies could not enter the system at all — the case went on being
// chased, and eventually closed for non-response, while the answer sat
// in somebody's email as a scan.
//
// The engine transcribes the document and runs the same analysis an
// emailed reply gets. It refuses an empty submission rather than
// inventing a placeholder, and it says when it could not read a document
// rather than guessing — both of those answers are shown here as-is.
export default function PaperReplyPanel({
  caseId,
  canSubmit,
}: {
  caseId: string;
  canSubmit: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const hasSomething = file !== null || text.trim().length > 0;

  async function submit() {
    setSending(true);
    setError(null);

    const body = new FormData();
    if (file) body.append("file", file);
    if (text.trim()) body.append("text", text.trim());

    const res = await fetch(`/api/admin/cases/${caseId}/negotiation/reply`, { method: "POST", body });

    setSending(false);
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      setError(payload?.error ?? "Failed to record the reply.");
      return;
    }
    setDone(true);
    setFile(null);
    setText("");
    if (inputRef.current) inputRef.current.value = "";
    // The status, the negotiation and anything the analysis concluded all
    // change server-side.
    router.refresh();
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-serif text-lg font-bold text-gray-900">Reply recorded</h2>
        <p className="mt-2 text-sm text-gray-600">
          It has been read and analysed the same way an emailed reply would be. The case status above
          reflects whatever it said.
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-3 text-sm font-medium text-primary-600 hover:text-primary-700"
        >
          Add another
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="font-serif text-lg font-bold text-gray-900">Reply that came by post, fax or phone</h2>
      <p className="mt-1 text-sm text-gray-600">
        Attach a scan or photo of the letter, or type what they said. It is read and analysed exactly as an
        emailed reply would be.
      </p>

      <label htmlFor="paper-reply-file" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        Scan or photo (PDF, PNG, JPEG — optional)
      </label>
      <input
        id="paper-reply-file"
        ref={inputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-full file:border-0 file:bg-primary-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-700"
      />

      <label htmlFor="paper-reply-text" className="mt-4 block text-xs font-semibold uppercase tracking-wide text-gray-500">
        What they said (optional if a file is attached)
      </label>
      <textarea
        id="paper-reply-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="e.g. billing office called and agreed to adjust the account to $112.49"
        className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:border-primary-500 focus:outline-none"
      />

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit || !hasSomething || sending}
        className="mt-4 rounded-full bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {sending ? "Reading…" : "Record the reply"}
      </button>
      <p className="mt-2 text-xs text-gray-500">
        {canSubmit
          ? "The engine acts on what this says, so give it the provider's words rather than a summary where you can."
          : "You do not have full access to the negotiation domain, so you cannot record a reply."}
      </p>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
