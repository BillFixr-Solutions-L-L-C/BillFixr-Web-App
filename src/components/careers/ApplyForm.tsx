"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage, useT } from "@/lib/i18n/client";

function SendIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m5 12 14-7-5.5 15-3-6.5L5 12Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

export default function ApplyForm({ jobId }: { jobId: string }) {
  const t = useT();
  // Likewise: an applicant has no profile, so the page's own language is
  // what the acknowledgement is written in.
  const language = useLanguage();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cvFile) {
      setError("Please attach your CV/resume.");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const path = `${jobId}/${Date.now()}-${cvFile.name}`;
    const { error: uploadError } = await supabase.storage.from("cvs").upload(path, cvFile);
    if (uploadError) {
      setError(uploadError.message);
      setLoading(false);
      return;
    }

    const res = await fetch("/api/careers/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, fullName, email, phone, cvPath: path, language }),
    });

    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? "Failed to submit application. Please try again.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="mt-5 rounded-2xl bg-primary-50 p-5 text-center">
        <p className="text-sm font-semibold text-primary-900">{t("careers.submitted")}</p>
        <p className="mt-1 text-sm text-primary-900/70">
          {t("careers.submittedBody")}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-3">
      <input
        type="text"
        placeholder={t("careers.fullName")}
        required
        value={fullName}
        onChange={(e) => setFullName(e.target.value)}
        className="w-full rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
      />
      <input
        type="email"
        placeholder={t("auth.email")}
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
      />
      <input
        type="tel"
        placeholder={t("careers.phone")}
        required
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="w-full rounded-full border border-gray-200 bg-gray-50 px-5 py-3 text-sm placeholder:text-gray-400 focus:border-primary-400 focus:outline-none"
      />

      <div>
        <label className="text-sm text-primary-900">{t("careers.cv")}</label>
        <label className="mt-2 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-primary-200 px-6 py-8 text-center transition hover:border-primary-400">
          <input
            type="file"
            accept=".pdf,.doc,.docx"
            required
            className="hidden"
            onChange={(e) => setCvFile(e.target.files?.[0] ?? null)}
          />
          <span className="flex h-10 w-10 items-center justify-center rounded-full border border-primary-300 text-primary-600">
            <SendIcon />
          </span>
          <span className="text-sm text-primary-900/80">
            {cvFile ? (
              <span className="font-semibold text-primary-600">{cvFile.name}</span>
            ) : (
              <>
                {t("careers.dragDrop")} <span className="font-semibold text-primary-600">{t("careers.browse")}</span>
              </>
            )}
          </span>
          <span className="text-xs text-primary-900/40">{t("careers.fileHint")}</span>
        </label>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full rounded-full bg-[#0f7545] py-3.5 text-sm font-bold text-white transition hover:bg-primary-700 disabled:opacity-60"
      >
        {loading ? "Submitting…" : "Submit application"}
      </button>
    </form>
  );
}
