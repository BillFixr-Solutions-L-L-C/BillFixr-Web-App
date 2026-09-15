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

// Every non-list view (received/letter/summary, savings, payment, paid)
// shares the exact same BackToCasesButton component and backToList
// handler, not bespoke per-view logic — these two states are enough to
// prove the fix works generically for all of them.
describe("ActiveCasePage back navigation", () => {
  it("returns to the case list from a detail view", async () => {
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));
    await screen.findByRole("button", { name: "View Response" });

    await user.click(screen.getByRole("button", { name: "← Back to cases" }));

    expect(await screen.findByText("bill.pdf")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View Response" })).not.toBeInTheDocument();
  });

  it("has a way back from the summary view, reached deeper in the flow", async () => {
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));
    await user.click(await screen.findByRole("button", { name: "View Response" }));
    await user.click(await screen.findByRole("button", { name: "Summarize Reply" }));
    await screen.findByRole("button", { name: "Pay with Card" });

    await user.click(screen.getByRole("button", { name: "← Back to cases" }));

    expect(await screen.findByText("bill.pdf")).toBeInTheDocument();
    expect(screen.queryByText("AI Summary of Response")).not.toBeInTheDocument();
  });
});
