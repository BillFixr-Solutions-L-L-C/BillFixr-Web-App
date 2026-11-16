"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";

export default function NewsletterForm() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const res = await fetch("/api/newsletter/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    setStatus("done");
    setEmail("");
  }

  if (status === "done") {
    return <p className="mt-3 text-sm text-white/90">{t("site.subscribed")}</p>;
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="mt-3 flex w-full max-w-md items-center gap-1 rounded-full border-2 border-white bg-white p-1">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t("site.emailAddress")}
          className="w-full bg-transparent px-4 py-1.5 text-sm text-gray-600 placeholder:text-gray-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="flex shrink-0 items-center gap-2 rounded-full bg-primary-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-60"
        >
          ↗ {t("site.subscribe")}
        </button>
      </form>
      {status === "error" && <p className="mt-2 text-sm text-white/90">{t("site.subscribeFailed")}</p>}
    </div>
  );
}
