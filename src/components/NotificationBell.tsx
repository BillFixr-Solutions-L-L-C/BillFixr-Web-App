"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { timeAgo } from "@/lib/timeAgo";
import { useT } from "@/lib/i18n/client";

type Notification = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
};

const POLL_MS = 15000;

/**
 * Which edge the panel hangs from.
 *
 * It is 320px wide and has to stay on screen, and where it can go depends
 * entirely on where the bell is -- which this component cannot see. The
 * three callers are not alike: the admin topbar and the dashboard's phone
 * header both put the bell near the right edge of a full-width bar, where
 * hanging it from the right is correct, but the desktop sidebar puts it at
 * the right edge of a 235px column, where the same rule pushed 84 of its
 * 320px off the left of the screen. Measured on 2026-11-25: the panel sat
 * at x=-84, so the heading read "IONS" and every message lost its first
 * few words.
 */
export type BellAlign = "left" | "right";

export default function NotificationBell({
  initialNotifications,
  align = "right",
}: {
  initialNotifications: Notification[];
  align?: BellAlign;
}) {
  const t = useT();
  const [notifications, setNotifications] = useState(initialNotifications);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Polls for new notifications (e.g. a live-chat message from a customer)
  // so the bell updates without needing a full page navigation — the
  // layout's server-side fetch only ever ran once, on the initial load.
  useEffect(() => {
    const supabase = createClient();
    let userId: string | null = null;
    let cancelled = false;

    async function fetchNotifications() {
      if (!userId) return;
      const { data } = await supabase
        .from("notifications")
        .select("id, type, message, read, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!cancelled && data) setNotifications(data);
    }

    async function init() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userId = user?.id ?? null;
    }
    init();

    const interval = setInterval(fetchNotifications, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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
        aria-label={t("notifications.title")}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-50 hover:bg-gray-100"
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
        <div
          className={`absolute top-full z-20 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-gray-100 bg-white p-2 shadow-lg ${
            align === "left" ? "left-0" : "right-0"
          }`}
        >
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{t("notifications.title")}</p>
          {notifications.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-gray-400">{t("notifications.empty")}</p>
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
