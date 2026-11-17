"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import ConfirmModal from "@/components/ConfirmModal";
import { useT } from "@/lib/i18n/client";

export default function DeleteMyAccount() {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setBusy(false);
      setConfirming(false);
      setError(body.error ?? "Failed to delete account");
      return;
    }

    // The account is already gone, so there is no profile row left
    // to stamp — plain sign-out, not signOutAndRecord.
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="h-fit max-w-md rounded-xl border border-red-100 bg-red-50/50 p-5">
      <h2 className="text-sm font-semibold text-red-700">{t("settings.deleteAccount")}</h2>
      <p className="mt-1 text-sm text-gray-600">
        {t("settings.deleteBody")}
      </p>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 rounded-full bg-red-500 px-6 py-2.5 text-sm font-semibold text-white hover:bg-red-600"
      >
        {t("settings.deleteMine")}
      </button>

      <ConfirmModal
        open={confirming}
        title={t("settings.deleteConfirm")}
        message="This permanently deletes your BillFixr account and all associated data (bills, cases, support tickets). This cannot be undone."
        confirmLabel="Yes, Delete Account"
        danger
        busy={busy}
        onConfirm={handleDelete}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
