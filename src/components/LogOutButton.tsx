"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Signs out against Supabase directly, the same way the dashboard's logout
// page does — nothing goes through our own API, which matters on the
// suspended page, where the proxy blocks this account's API calls.
export default function LogOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogOut() {
    setLoading(true);
    await createClient().auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogOut}
      disabled={loading}
      className="rounded-full border border-gray-200 px-8 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
    >
      {loading ? "Logging out…" : "Log out"}
    </button>
  );
}
