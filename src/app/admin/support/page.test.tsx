import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminSupportPage from "./page";

const TICKETS = [
  { id: "t-1", subject: "Billing question", message: "Help", status: "open", created_at: "2026-01-01", profiles: { name: "Alice", email: "alice@example.com" } },
  { id: "t-2", subject: "Can't upload", message: "Help", status: "in_progress", created_at: "2026-01-02", profiles: { name: "Bob", email: "bob@example.com" } },
  { id: "t-3", subject: "Refund request", message: "Help", status: "resolved", created_at: "2026-01-03", profiles: { name: "Carol", email: "carol@example.com" } },
  { id: "t-4", subject: "Live Chat", message: "(live chat)", status: "open", created_at: "2026-01-04", profiles: { name: "Dave", email: "dave@example.com" } },
  { id: "t-5", subject: "Live Chat", message: "(live chat)", status: "resolved", created_at: "2026-01-05", profiles: { name: "Erin", email: "erin@example.com" } },
];

let domainAccess = "full";
let chatMessages: { from: string; text: string }[] = [];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async () => ({ data: domainAccess, error: null }),
    from: (table: string) => {
      if (table === "chat_messages") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: chatMessages, error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          order: async () => ({ data: TICKETS, error: null }),
        }),
      };
    },
  }),
}));

const originalFetch = global.fetch;
beforeEach(() => {
  domainAccess = "full";
  chatMessages = [];
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("AdminSupportPage", () => {
  it("shows an access-restricted message when the caller has no client_data access", async () => {
    domainAccess = "none";
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Access restricted")).toBeInTheDocument());
    expect(screen.queryByText("Billing question")).not.toBeInTheDocument();
  });

  it("filters by search text across subject, customer name, and email", async () => {
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Billing question")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Search by subject or customer"), "bob@example.com");

    expect(screen.getByText("Can't upload")).toBeInTheDocument();
    expect(screen.queryByText("Billing question")).not.toBeInTheDocument();
    expect(screen.queryByText("Refund request")).not.toBeInTheDocument();
  });

  it("filters by status", async () => {
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Billing question")).toBeInTheDocument());

    await user.selectOptions(screen.getByDisplayValue("All statuses"), "Done");

    expect(screen.getByText("Refund request")).toBeInTheDocument();
    expect(screen.queryByText("Billing question")).not.toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Billing question")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Search by subject or customer"), "nobody-matches");

    expect(screen.getByText("No tickets match your search.")).toBeInTheDocument();
  });

  it("shows the description field for a regular ticket, not a chat thread", async () => {
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Billing question")).toBeInTheDocument());
    await user.click(screen.getByText("Billing question"));

    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Type a reply…")).not.toBeInTheDocument();
  });

  it("shows the chat thread and reply box for a Live Chat ticket", async () => {
    chatMessages = [
      { from: "user", text: "Am I making payment before I get the adjusted bill?" },
      { from: "agent", text: "After it's adjusted, yes." },
    ];
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Dave")).toBeInTheDocument());
    await user.click(screen.getByText("Dave"));

    await waitFor(() =>
      expect(screen.getByText("Am I making payment before I get the adjusted bill?")).toBeInTheDocument(),
    );
    expect(screen.getByText("After it's adjusted, yes.")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a reply…")).toBeInTheDocument();
  });

  it("hides the reply box for a Live Chat ticket when canWrite is false", async () => {
    domainAccess = "limited";
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Dave")).toBeInTheDocument());
    await user.click(screen.getByText("Dave"));

    await waitFor(() => expect(screen.getByText("No messages yet.")).toBeInTheDocument());
    expect(screen.queryByPlaceholderText("Type a reply…")).not.toBeInTheDocument();
  });

  it("hides the reply box and shows a closed notice for a resolved Live Chat ticket", async () => {
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Erin")).toBeInTheDocument());
    await user.click(screen.getByText("Erin"));

    await waitFor(() => expect(screen.getByText("No messages yet.")).toBeInTheDocument());
    expect(screen.queryByPlaceholderText("Type a reply…")).not.toBeInTheDocument();
    expect(
      screen.getByText("This conversation has been marked resolved. Reopen it below to reply."),
    ).toBeInTheDocument();
  });

  it("sends a reply through the gated route and appends it to the thread", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<AdminSupportPage />);

    await waitFor(() => expect(screen.getByText("Dave")).toBeInTheDocument());
    await user.click(screen.getByText("Dave"));
    await waitFor(() => expect(screen.getByText("No messages yet.")).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText("Type a reply…"), "On it now");
    await user.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByText("On it now")).toBeInTheDocument());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/support-tickets/t-4/chat",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "On it now" }) }),
    );
  });
});
