import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import SupportPage from "./page";

const mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mock.client,
}));

async function fillComplaintForm(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByRole("combobox"), "Payment issue");
  await user.type(screen.getByRole("textbox"), "My bill still shows the wrong amount.");
}

async function openChatAndStartConversation(user: ReturnType<typeof userEvent.setup>) {
  mock.queueResult("support_tickets", { data: [], error: null }); // no existing tickets
  mock.queueResult("support_tickets", {
    data: { id: "ticket-1", status: "open", created_at: "2026-01-01T00:00:00Z" },
    error: null,
  });
  mock.queueResult("support_tickets", {
    data: { id: "ticket-1", status: "open", created_at: "2026-01-01T00:00:00Z" },
    error: null,
  });
  mock.queueResult("chat_messages", { data: [], error: null });

  await user.click(screen.getByRole("button", { name: "Open live chat" }));
  await screen.findByText("Start a conversation with our support team below.");
  await user.click(screen.getByRole("button", { name: "Start a new conversation" }));
  await screen.findByRole("button", { name: "Voice input" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mock.rpc.mockResolvedValue({ data: false, error: null });
});

describe("SupportPage live chat", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("prompts to start a conversation when there's no existing live ticket", async () => {
    mock.queueResult("support_tickets", { data: [], error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));

    expect(await screen.findByText("Start a conversation with our support team below.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a new conversation" })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("How can i help you?")).not.toBeInTheDocument();
  });

  it("resumes an existing open ticket instead of starting a new one", async () => {
    mock.queueResult("support_tickets", {
      data: [{ id: "ticket-1", status: "in_progress", created_at: "2026-01-01T00:00:00Z" }],
      error: null,
    });
    mock.queueResult("support_tickets", {
      data: { id: "ticket-1", status: "in_progress", created_at: "2026-01-01T00:00:00Z" },
      error: null,
    });
    mock.queueResult("chat_messages", { data: [{ from: "user", text: "hi" }], error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));

    expect(await screen.findByText("hi")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("How can i help you?")).toBeInTheDocument();
  });

  it("shows the voice input control as disabled rather than a dead-looking active button", async () => {
    const user = userEvent.setup();
    render(<SupportPage />);

    await openChatAndStartConversation(user);

    expect(screen.getByRole("button", { name: "Voice input" })).toBeDisabled();
  });

  it("sends the message to the gated route", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<SupportPage />);

    await openChatAndStartConversation(user);

    await user.type(screen.getByPlaceholderText("How can i help you?"), "Is my case still active?");
    const sendButtons = screen.getAllByRole("button", { name: "Send" });
    await user.click(sendButtons[sendButtons.length - 1]);

    expect(screen.getByText("Is my case still active?")).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/dashboard/chat/send",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ ticketId: "ticket-1", text: "Is my case still active?" }),
      }),
    );
  });

  it("keeps a just-sent message visible even if a poll resolves without it yet", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.useFakeTimers();
    try {
      // The polling interval is created as soon as a ticket becomes
      // active, so fake timers have to be in place for the whole flow —
      // switching to them mid-test would leave an earlier real interval
      // running uncontrolled in the background. userEvent hangs when
      // combined with fake timers, so this uses fireEvent throughout.
      mock.queueResult("support_tickets", { data: [], error: null });
      mock.queueResult("support_tickets", {
        data: { id: "ticket-1", status: "open", created_at: "2026-01-01T00:00:00Z" },
        error: null,
      });
      mock.queueResult("support_tickets", {
        data: { id: "ticket-1", status: "open", created_at: "2026-01-01T00:00:00Z" },
        error: null,
      });
      mock.queueResult("chat_messages", { data: [], error: null });

      render(<SupportPage />);
      fireEvent.click(screen.getByRole("button", { name: "Open live chat" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      fireEvent.click(screen.getByRole("button", { name: "Start a new conversation" }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      fireEvent.change(screen.getByPlaceholderText("How can i help you?"), {
        target: { value: "Are you there?" },
      });
      const sendButtons = screen.getAllByRole("button", { name: "Send" });
      fireEvent.click(sendButtons[sendButtons.length - 1]);

      expect(screen.getByText("Are you there?")).toBeInTheDocument();

      // Simulate a poll that started before the send landed, resolving
      // with a snapshot that doesn't include it yet — this is the exact
      // race that used to wipe the message off the screen.
      mock.queueResult("chat_messages", { data: [], error: null });
      mock.queueResult("support_tickets", {
        data: { id: "ticket-1", status: "open", created_at: "2026-01-01T00:00:00Z" },
        error: null,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getByText("Are you there?")).toBeInTheDocument();

      // A later poll that correctly includes it shouldn't duplicate it.
      mock.queueResult("chat_messages", { data: [{ from: "user", text: "Are you there?" }], error: null });
      mock.queueResult("support_tickets", {
        data: { id: "ticket-1", status: "open", created_at: "2026-01-01T00:00:00Z" },
        error: null,
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });

      expect(screen.getAllByText("Are you there?")).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows Support is online when the presence check comes back true", async () => {
    mock.rpc.mockResolvedValue({ data: true, error: null });
    mock.queueResult("support_tickets", { data: [], error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));

    expect(await screen.findByText("Support is online")).toBeInTheDocument();
  });

  it("shows the offline message when no one is available", async () => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    mock.queueResult("support_tickets", { data: [], error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));

    expect(await screen.findByText("We'll reply as soon as we can")).toBeInTheDocument();
  });

  it("closes a resolved conversation and offers to start a new one", async () => {
    mock.queueResult("support_tickets", {
      data: [{ id: "ticket-1", status: "resolved", created_at: "2026-01-01T00:00:00Z" }],
      error: null,
    });
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));

    // A fully resolved ticket set means there's no "live" one to resume —
    // same empty prompt as never having chatted, but it now also shows up
    // in Past conversations.
    expect(await screen.findByText("Start a conversation with our support team below.")).toBeInTheDocument();
    expect(screen.getByText("Past conversations (1)")).toBeInTheDocument();
  });

  it("lets the customer browse a past conversation read-only", async () => {
    mock.queueResult("support_tickets", {
      data: [{ id: "ticket-old", status: "resolved", created_at: "2026-01-01T00:00:00Z" }],
      error: null,
    });
    mock.queueResult("chat_messages", { data: [{ from: "agent", text: "Glad we sorted it out." }], error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));
    await user.click(await screen.findByText("Past conversations (1)"));
    await user.click(screen.getByText(/Conversation from/));

    expect(await screen.findByText("Glad we sorted it out.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("How can i help you?")).not.toBeInTheDocument();
  });

  it("lets the customer rate a resolved conversation and shows a thank-you after rating", async () => {
    mock.queueResult("support_tickets", {
      data: [{ id: "ticket-old", status: "resolved", created_at: "2026-01-01T00:00:00Z", chat_rating: null }],
      error: null,
    });
    mock.queueResult("chat_messages", { data: [{ from: "agent", text: "All set!" }], error: null });
    mock.queueResult("support_tickets", {
      data: { id: "ticket-old", status: "resolved", created_at: "2026-01-01T00:00:00Z", chat_rating: null },
      error: null,
    });
    mock.queueResult("support_tickets", { data: null, error: null }); // the rating update itself

    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));
    await user.click(await screen.findByText("Past conversations (1)"));
    await user.click(screen.getByText(/Conversation from/));

    expect(await screen.findByText("How was this conversation?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Rate 5 stars" }));

    await waitFor(() =>
      expect(screen.getByText("Thanks for rating this conversation ★★★★★")).toBeInTheDocument(),
    );
    const lastBuilder = mock.from.mock.results[mock.from.mock.results.length - 1].value;
    expect(lastBuilder.update).toHaveBeenCalledWith({ chat_rating: 5 });
  });

  it("shows the thank-you message instead of the prompt when already rated", async () => {
    mock.queueResult("support_tickets", {
      data: [{ id: "ticket-old", status: "resolved", created_at: "2026-01-01T00:00:00Z", chat_rating: 4 }],
      error: null,
    });
    mock.queueResult("chat_messages", { data: [], error: null });
    mock.queueResult("support_tickets", {
      data: { id: "ticket-old", status: "resolved", created_at: "2026-01-01T00:00:00Z", chat_rating: 4 },
      error: null,
    });

    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Open live chat" }));
    await user.click(await screen.findByText("Past conversations (1)"));
    await user.click(screen.getByText(/Conversation from/));

    expect(await screen.findByText("Thanks for rating this conversation ★★★★☆")).toBeInTheDocument();
    expect(screen.queryByText("How was this conversation?")).not.toBeInTheDocument();
  });
});

describe("SupportPage complaint form", () => {
  it("shows a validation error and never inserts when topic and message are missing", async () => {
    const user = userEvent.setup();
    render(<SupportPage />);

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(screen.getByText("Please select a topic and enter a message.")).toBeInTheDocument();
    expect(mock.from).not.toHaveBeenCalledWith("support_tickets");
  });

  it("shows a login-required error when there is no authenticated user", async () => {
    mock.getUser.mockResolvedValue({ data: { user: null } });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("You need to be logged in to send a message.")).toBeInTheDocument());
    expect(mock.from).not.toHaveBeenCalledWith("support_tickets");
  });

  it("shows the server error and does not clear the form when the insert fails", async () => {
    mock.queueResult("support_tickets", { data: null, error: { message: "connection refused" } });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("connection refused")).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("My bill still shows the wrong amount.");
  });

  it("submits the ticket and shows the sent confirmation on success", async () => {
    mock.queueResult("support_tickets", { data: null, error: null });
    const user = userEvent.setup();
    render(<SupportPage />);

    await fillComplaintForm(user);
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText(/Your message has been sent/)).toBeInTheDocument());
    const insertCall = mock.from.mock.results.find((r) => typeof r.value.insert === "function")?.value.insert;
    expect(insertCall).toHaveBeenCalledWith({
      user_id: "user-1",
      subject: "Payment issue",
      message: "My bill still shows the wrong amount.",
      status: "open",
    });
    expect(screen.getByRole("textbox")).toHaveValue("");
  });
});
