"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Result = { id: string; name: string; email: string };

export default function AdminSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;

    const timer = setTimeout(async () => {
      const res = await fetch(`/api/admin/search-customers?q=${encodeURIComponent(q)}`);
      if (!res.ok) return;
      const body = await res.json();
      setResults(body.results ?? []);
      setOpen(true);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative hidden flex-1 px-8 md:block">
      <div className="mx-auto flex w-full max-w-md items-center gap-2 rounded-full bg-gray-50 px-4 py-2.5 text-sm text-gray-500 focus-within:ring-1 focus-within:ring-primary-300">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-gray-400">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
          <path d="m20 20-3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search customers by name or email"
          className="w-full bg-transparent text-gray-700 placeholder:text-gray-400 focus:outline-none"
        />
      </div>

      {open && query.trim() && (
        <div className="absolute left-1/2 top-full z-20 mt-2 w-full max-w-md -translate-x-1/2 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No customers found.</p>
          ) : (
            results.map((r) => (
              <Link
                key={r.id}
                href={`/admin/users/${r.id}`}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-3 py-2 text-sm hover:bg-gray-50"
              >
                <p className="font-medium text-gray-900">{r.name}</p>
                <p className="text-xs text-gray-400">{r.email}</p>
              </Link>
            ))
          )}
        </div>
      )}
    </div>
  );
}
