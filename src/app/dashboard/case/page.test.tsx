import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import ActiveCasePage from "./page";

const mock = createSupabaseMock();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => mock.client,
}));
vi.mock("@/lib/billDocuments", () => ({
  getBillDocuments: async () => [null],
}));

const CASE_ROW = {
  id: "case-1",
  status: "response_received",
  bills: { filename: "bill.pdf", storage_url: null, uploaded_at: "2026-01-01T00:00:00Z" },
  errors_detected: null,
  savings_found: null,
  appeal_letter_text: null,
  ai_summary_text: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mock.queueResult("cases", { data: [CASE_ROW], error: null });
  mock.queueResult("app_settings", { data: { success_fee_percentage: 30 }, error: null });
});

// Every non-list view (received, savings, payment, paid) shares the exact
// same BackToCasesButton component and backToList handler, not bespoke
// per-view logic — these two states are enough to prove the fix works
// generically for all of them.
describe("ActiveCasePage back navigation", () => {
  it("returns to the case list from a detail view", async () => {
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));
    // The detail view: stats the list doesn't show.
    await screen.findByText("Bill Analyzed");

    await user.click(screen.getByRole("button", { name: "← Back to cases" }));

    expect(await screen.findByText("bill.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Bill Analyzed")).not.toBeInTheDocument();
  });

  it("has a way back from the comparison view, reached deeper in the flow", async () => {
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    // An adjusted bill has arrived, which is what puts "Check and
    // Proceed" on screen — without it this never reaches the comparison
    // view and the assertion below would pass for the wrong reason.
    mock.queueResult("letter_events", { data: [], error: null });
    mock.queueResult("case_documents", {
      data: [
        {
          id: "doc-1",
          type: "new_bill",
          filename: "adjusted.pdf",
          storage_url: "u/adjusted.pdf",
          size_bytes: 1024,
          received_on: null,
          created_at: "2026-02-01T00:00:00Z",
        },
      ],
      error: null,
    });

    await user.click(await screen.findByText("bill.pdf"));
    await user.click(await screen.findByRole("button", { name: "Check and Proceed" }));
    await screen.findByText("Over Billed");

    await user.click(screen.getByRole("button", { name: "← Back to cases" }));

    expect(await screen.findByText("bill.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Over Billed")).not.toBeInTheDocument();
  });
});
