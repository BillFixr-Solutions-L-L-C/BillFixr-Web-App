"use client";

import { useState } from "react";
import PageHeading from "@/components/dashboard/PageHeading";
import { createClient } from "@/lib/supabase/client";

// Shown until a real chat_messages history exists for this user's live-chat
// ticket — Step 7 contract stub, not an AI-generated greeting.
const seedMessages = [
  { from: "agent", text: "How can i help you?" },
  { from: "user", text: "Am i making payment before i will have access to the new bill adjusted?" },
  { from: "agent", text: "Yes, after your bill has been adjusted.. you will make payment and get the adjust bill." },
];

// Sent automatically after a real user message — a static acknowledgment,
// not an AI reply. Real AI/agent responses are a separate, later workstream.
const CANNED_AGENT_REPLY = "Thanks for your message — a member of our support team will follow up here shortly.";

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
  const [messages, setMessages] = useState<{ from: string; text: string }[]>(seedMessages);
  const [draft, setDraft] = useState("");
  const [chatTicketId, setChatTicketId] = useState<string | null>(null);
  const [chatLoaded, setChatLoaded] = useState(false);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function openChat() {
    setChatOpen(true);
    if (chatLoaded) return;
    setChatLoaded(true);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: existingTicket } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("user_id", user.id)
      .eq("subject", "Live Chat")
      .limit(1)
      .maybeSingle();

    let ticketId = existingTicket?.id ?? null;
    if (!ticketId) {
      const { data: newTicket } = await supabase
        .from("support_tickets")
        .insert({ user_id: user.id, subject: "Live Chat", message: "(live chat)", status: "open" })
        .select("id")
        .single();
      ticketId = newTicket?.id ?? null;
    }
    if (!ticketId) return;
    setChatTicketId(ticketId);

    const { data: history } = await supabase
      .from("chat_messages")
      .select("from, text")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });

    if (history && history.length > 0) {
      setMessages(history);
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || !chatTicketId) return;
    setDraft("");
    setMessages((m) => [...m, { from: "user", text }, { from: "agent", text: CANNED_AGENT_REPLY }]);

    const supabase = createClient();
    await supabase.from("chat_messages").insert([
      { ticket_id: chatTicketId, from: "user", text },
      { ticket_id: chatTicketId, from: "agent", text: CANNED_AGENT_REPLY },
    ]);
  }

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
          <button
            type="button"
            onClick={() => setChatOpen(false)}
            aria-label="Close chat"
            className="self-end text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <div className="flex-1 space-y-4 overflow-y-auto py-4">
            {messages.map((m, i) =>
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
            )}
          </div>

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
            <button type="button" aria-label="Voice input" className="text-gray-400">
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

          <Avatar className="absolute -bottom-4 -right-4 h-14 w-14 ring-4 ring-white after:absolute after:bottom-0.5 after:right-0.5 after:h-3.5 after:w-3.5 after:rounded-full after:bg-primary-600 after:ring-2 after:ring-white" />
        </div>
      )}
    </div>
  );
}
