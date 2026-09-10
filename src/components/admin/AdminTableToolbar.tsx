"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type StatusOption = { value: string; label: string };

// Search box + optional status filter, synced to the URL's `q`/`status`
// query params — the server component page reads them back and does the
// actual filtering, so this component owns no data itself. Search is
// debounced; the status select navigates immediately. Both reset `page`
// back to 1, since a new search/filter invalidates whatever page you were
// on.
export default function AdminTableToolbar({
  searchPlaceholder,
  statusOptions,
}: {
  searchPlaceholder: string;
  statusOptions?: StatusOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [q, setQ] = useState(searchParams.get("q") ?? "");

  useEffect(() => {
    const current = searchParams.get("q") ?? "";
    if (q === current) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (q) params.set("q", q);
      else params.delete("q");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    }, 400);
    return () => clearTimeout(handle);
    // Only re-run when the debounced value itself changes — including
    // searchParams/pathname/router here would re-fire on every navigation
    // this effect just caused.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function setStatus(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set("status", value);
    else params.delete("status");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={searchPlaceholder}
        className="min-w-0 flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm focus:border-primary-400 focus:outline-none"
      />
      {statusOptions && (
        <select
          value={searchParams.get("status") ?? "all"}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:border-primary-400 focus:outline-none"
        >
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
