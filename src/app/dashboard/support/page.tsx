"use client";

import { useEffect, useState } from "react";
import PageHeading from "@/components/dashboard/PageHeading";
import { createClient } from "@/lib/supabase/client";

const CHAT_POLL_MS = 3000;
const ONLINE_POLL_MS = 30000;

type ChatMessage = { from: string; text: string };
type ChatTicket = { id: string; status: string; created_at: string; chat_rating: number | null };

function Avatar({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full bg-gradient-to-br from-accent-300 to-primary-400 ${className}`}
    />
  );
}

const complaintOptions = ["Payment issue", "Case status question", "Document access", "Other"];

export default function SupportPage() {
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [tickets, setTickets] = useState<ChatTicket[]>([]);
  const [activeTicketId, setActiveTicketId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [startingNew, setStartingNew] = useState(false);
  const [ratingSaving, setRatingSaving] = useState(false);

  const liveTicket = tickets.find((t) => t.status !== "resolved") ?? null;
  const pastTickets = tickets.filter((t) => t.status === "resolved");
  const activeTicket = tickets.find((t) => t.id === activeTicketId) ?? null;

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function loadTickets(uid: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("support_tickets")
      .select("id, status, created_at, chat_rating")
      .eq("user_id", uid)
      .eq("subject", "Live Chat")
      .order("created_at", { ascending: false });
    const list = (data as ChatTicket[]) ?? [];
    setTickets(list);
    return list;
  }

  async function openChat() {
    setChatOpen(true);
    if (chatLoaded) return;
    setChatLoaded(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const list = await loadTickets(user.id);
    const live = list.find((t) => t.status !== "resolved");
    if (live) setActiveTicketId(live.id);
  }

  async function startNewConversation() {
    if (!userId) return;
    setStartingNew(true);
    const supabase = createClient();
    const { data: newTicket } = await supabase
      .from("support_tickets")
      .insert({ user_id: userId, subject: "Live Chat", message: "(live chat)", status: "open" })
      .select("id, status, created_at, chat_rating")
      .single();
    setStartingNew(false);
    if (!newTicket) return;
    setTickets((prev) => [newTicket as ChatTicket, ...prev]);
    setActiveTicketId(newTicket.id);
    setHistoryOpen(false);
    setMessages([]);
  }

  function openPastTicket(ticket: ChatTicket) {
    setActiveTicketId(ticket.id);
    setHistoryOpen(false);
    setMessages([]);
  }

  function backToChat() {
    setHistoryOpen(false);
    setActiveTicketId(liveTicket?.id ?? null);
    setMessages([]);
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !activeTicketId) return;
    setDraft("");
    setMessages((m) => [...m, { from: "user", text }]);

    await fetch("/api/dashboard/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: activeTicketId, text }),
    });
  }

  async function rateConversation(rating: number) {
    if (!activeTicketId || ratingSaving) return;
    setRatingSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("support_tickets")
      .update({ chat_rating: rating })
      .eq("id", activeTicketId);
    setRatingSaving(false);
    if (!error) {
      setTickets((prev) => prev.map((t) => (t.id === activeTicketId ? { ...t, chat_rating: rating } : t)));
    }
  }

  // Loads + polls the active thread's messages, and re-checks the
  // ticket's own status each cycle — so if an admin resolves it while
  // this is open, the input closes live instead of on next visit. A
  // resolved thread never changes, so it only loads once.
  useEffect(() => {
    if (!chatOpen || !activeTicketId) return;
    const isResolved = activeTicket?.status === "resolved";
    const supabase = createClient();
    let cancelled = false;

    async function load() {
      const [{ data: msgs }, { data: ticket }] = await Promise.all([
        supabase
          .from("chat_messages")
          .select("from, text")
          .eq("ticket_id", activeTicketId)
          .order("created_at", { ascending: true }),
        supabase
          .from("support_tickets")
          .select("id, status, created_at, chat_rating")
          .eq("id", activeTicketId)
          .single(),
      ]);
      if (cancelled) return;
      if (msgs) setMessages(msgs);
      if (ticket) setTickets((prev) => prev.map((t) => (t.id === ticket.id ? (ticket as ChatTicket) : t)));
    }

    load();
    if (isResolved) return;
    const interval = setInterval(load, CHAT_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatOpen, activeTicketId]);

  // "Is anyone actually there right now" indicator.
  useEffect(() => {
    if (!chatOpen) return;
    const supabase = createClient();
    let cancelled = false;

    async function checkOnline() {
      const { data } = await supabase.rpc("support_is_online");
      if (!cancelled) setIsOnline(Boolean(data));
    }

    checkOnline();
    const interval = setInterval(checkOnline, ONLINE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [chatOpen]);

  async function handleSubmitTicket() {
    setError(null);
    if (!subject || !message.trim()) {
      setError("Please select a topic and enter a message.");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("You need to be logged in to send a message.");
      setSubmitting(false);
      return;
    }

    const { error: insertError } = await supabase.from("support_tickets").insert({
      user_id: user.id,
      subject,
      message,
      status: "open",
    });

    setSubmitting(false);
    if (insertError) {
      setError(insertError.message);
      return;
    }

    setSubject("");
    setMessage("");
    setSubmitted(true);
  }

  return (
    <div className="relative">
      <PageHeading title="Support" />

      <div className="space-y-4">
        <select
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value);
            setSubmitted(false);
          }}
          className="w-full rounded-lg border border-primary-200 px-4 py-2.5 text-sm text-gray-500 focus:border-primary-400 focus:outline-none"
        >
          <option value="">Select your complain</option>
          {complaintOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>

        <div>
          <label className="text-sm text-gray-700">Message</label>
          <textarea
            rows={12}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setSubmitted(false);
            }}
            className="mt-2 w-full rounded-xl border border-primary-200 px-4 py-3 text-sm focus:border-primary-400 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
        {submitted && (
          <p className="text-sm text-primary-600">
            Your message has been sent. We&apos;ll get back to you shortly.
          </p>
        )}

        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={handleSubmitTicket}
            disabled={submitting}
            className="rounded-full bg-primary-600 px-8 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
          >
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </div>

      {!chatOpen && (
        <button
          type="button"
          onClick={openChat}
          aria-label="Open live chat"
          className="fixed bottom-6 right-6 z-40 flex items-center gap-3 rounded-full bg-primary-600 py-2 pl-2 pr-5 text-sm font-semibold text-white shadow-lg hover:bg-primary-700"
        >
          <Avatar className="relative h-9 w-9 after:absolute after:bottom-0 after:right-0 after:h-2.5 after:w-2.5 after:rounded-full after:bg-white after:ring-2 after:ring-primary-600" />
          Live chat with support
        </button>
      )}

      {chatOpen && (
        <div className="fixed inset-x-4 bottom-6 z-50 flex h-[32rem] max-h-[calc(100vh-3rem)] flex-col rounded-3xl bg-white/95 p-6 shadow-2xl backdrop-blur sm:inset-x-auto sm:right-6 sm:w-full sm:max-w-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {isOnline !== null && (
                <>
                  <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-primary-500" : "bg-gray-300"}`} />
                  {isOnline ? "Support is online" : "We'll reply as soon as we can"}
                </>
              )}
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              aria-label="Close chat"
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          {(pastTickets.length > 0 || historyOpen) && (
            <button
              type="button"
              onClick={historyOpen ? backToChat : () => setHistoryOpen(true)}
              className="mt-2 self-start text-xs font-medium text-primary-600 hover:text-primary-700"
            >
              {historyOpen ? "← Back to chat" : `Past conversations (${pastTickets.length})`}
            </button>
          )}

          {historyOpen ? (
            <div className="flex-1 space-y-2 overflow-y-auto py-4">
              {pastTickets.length === 0 ? (
                <p className="text-center text-sm text-gray-400">No past conversations yet.</p>
              ) : (
                pastTickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openPastTicket(t)}
                    className="block w-full rounded-xl border border-gray-100 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Conversation from{" "}
                    {new Date(t.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </button>
                ))
              )}
            </div>
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-y-auto py-4">
                {!activeTicketId ? (
                  <p className="text-center text-sm text-gray-400">
                    Start a conversation with our support team below.
                  </p>
                ) : messages.length === 0 ? (
                  <p className="text-center text-sm text-gray-400">No messages yet — say hello!</p>
                ) : (
                  messages.map((m, i) =>
                    m.from === "agent" ? (
                      <div
                        key={i}
                        className="ml-auto max-w-[80%] rounded-2xl bg-primary-50 px-4 py-3 text-sm text-primary-800"
                      >
                        {m.text}
                      </div>
                    ) : (
                      <div key={i} className="flex items-end gap-2">
                        <Avatar className="h-7 w-7" />
                        <div className="max-w-[75%] rounded-2xl bg-gray-100 px-4 py-3 text-sm text-gray-700">
                          {m.text}
                        </div>
                      </div>
                    ),
                  )
                )}
              </div>

              {!activeTicketId ? (
                <button
                  type="button"
                  onClick={startNewConversation}
                  disabled={startingNew}
                  className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                >
                  {startingNew ? "Starting…" : "Start a new conversation"}
                </button>
              ) : activeTicket?.status === "resolved" ? (
                <div className="text-center">
                  {activeTicket.chat_rating == null ? (
                    <>
                      <p className="mb-2 text-xs text-gray-500">How was this conversation?</p>
                      <div className="mb-3 flex justify-center gap-1">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => rateConversation(n)}
                            disabled={ratingSaving}
                            aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                            className="text-2xl text-accent-400 hover:scale-110 disabled:opacity-50"
                          >
                            ★
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="mb-3 text-xs text-primary-600">
                      Thanks for rating this conversation {"★".repeat(activeTicket.chat_rating)}
                      {"☆".repeat(5 - activeTicket.chat_rating)}
                    </p>
                  )}
                  <p className="mb-2 text-xs text-gray-400">This conversation has ended.</p>
                  <button
                    type="button"
                    onClick={startNewConversation}
                    disabled={startingNew}
                    className="rounded-full bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
                  >
                    {startingNew ? "Starting…" : "Start a new conversation"}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
                  <input
                    type="text"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendMessage();
                    }}
                    placeholder="How can i help you?"
                    className="flex-1 bg-transparent text-sm focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled
                    aria-label="Voice input"
                    title="Voice input isn't available yet"
                    className="text-gray-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    🎤
                  </button>
                  <button
                    type="button"
                    onClick={sendMessage}
                    aria-label="Send"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-white hover:bg-gray-700"
                  >
                    ↑
                  </button>
                </div>
              )}
            </>
          )}

          <Avatar className="absolute -bottom-4 -right-4 h-14 w-14 ring-4 ring-white after:absolute after:bottom-0.5 after:right-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-primary-600 after:ring-2 after:ring-white" />
        </div>
      )}
    </div>
  );
}
