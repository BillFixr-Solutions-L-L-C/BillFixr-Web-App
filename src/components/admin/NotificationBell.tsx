"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Notification = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function NotificationBell({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function markRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 14 6 10Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary-500" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-2 w-80 rounded-2xl border border-gray-100 bg-white p-2 shadow-lg">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Notifications</p>
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-gray-400">You&apos;re all caught up.</p>
          ) : (
            <div className="max-h-80 overflow-y-auto">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => markRead(n.id)}
                  className={`block w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    n.read ? "text-gray-400" : "text-gray-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span>{n.message}</span>
                    {!n.read && <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary-500" />}
                  </div>
                  <span className="text-xs text-gray-400">{timeAgo(n.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
