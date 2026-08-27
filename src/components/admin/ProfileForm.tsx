"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfileForm({
  userId,
  initialName,
  email,
  roleName,
}: {
  userId: string;
  initialName: string;
  email: string;
  roleName: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("idle");
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ name }).eq("id", userId);
    setBusy(false);
    setStatus(error ? "error" : "saved");
    if (!error) router.refresh();
  }

  return (
    <form onSubmit={save} className="mt-6 flex flex-col gap-5">
      <div>
        <label className="text-sm text-gray-600">Full name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-700"
        />
      </div>
      <div>
        <label className="text-sm text-gray-600">Work-mail</label>
        <input
          defaultValue={email}
          readOnly
          className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"
        />
      </div>
      <div>
        <label className="text-sm text-gray-600">Role</label>
        <input
          defaultValue={roleName}
          readOnly
          className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"
        />
      </div>

      {status === "saved" && <p className="text-sm text-primary-600">Saved.</p>}
      {status === "error" && <p className="text-sm text-red-600">Failed to save. Try again.</p>}

      <button
        type="submit"
        disabled={busy}
        className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save changes"}
      </button>
    </form>
  );
}
