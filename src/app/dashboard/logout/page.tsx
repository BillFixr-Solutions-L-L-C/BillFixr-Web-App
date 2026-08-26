"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogOut() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-[70vh] items-center justify-center gap-4">
      <Link
        href="/dashboard"
        className="rounded-full bg-primary-600 px-8 py-3 text-sm font-semibold text-white hover:bg-primary-700"
      >
        Back to Dashboard
      </Link>
      <button
        type="button"
        onClick={handleLogOut}
        disabled={loading}
        className="rounded-full bg-red-500 px-8 py-3 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-60"
      >
        {loading ? "Logging out…" : "Log Out"}
      </button>
    </div>
  );
}
