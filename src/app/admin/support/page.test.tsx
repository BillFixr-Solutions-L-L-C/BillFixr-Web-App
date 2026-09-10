import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AdminSupportPage from "./page";

const TICKETS = [
  { id: "t-1", subject: "Billing question", message: "Help", status: "open", created_at: "2026-01-01", profiles: { name: "Alice", email: "alice@example.com" } },
  { id: "t-2", subject: "Can't upload", message: "Help", status: "in_progress", created_at: "2026-01-02", profiles: { name: "Bob", email: "bob@example.com" } },
  { id: "t-3", subject: "Refund request", message: "Help", status: "resolved", created_at: "2026-01-03", profiles: { name: "Carol", email: "carol@example.com" } },
];

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        order: async () => ({ data: TICKETS, error: null }),
      }),
    }),
  }),
}));

describe("AdminSupportPage", () => {
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
});
