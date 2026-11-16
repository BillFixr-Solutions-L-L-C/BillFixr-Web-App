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

// The customer's example, verbatim: a $2,000 bill reduced to $500.
// Savings are $1,500 and the fee is a share of that, never of the $500.
async function openComparison(user: ReturnType<typeof userEvent.setup>) {
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
}

describe("ActiveCasePage success fee", () => {
  it("charges the fee on the saving, not on the corrected bill", async () => {
    mock.reset();
    mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mock.queueResult("cases", {
      data: [{ ...CASE_ROW, savings_found: 1500, adjusted_total: 500 }],
      error: null,
    });
    mock.queueResult("app_settings", { data: { success_fee_percentage: 20 }, error: null });

    const user = userEvent.setup();
    render(<ActiveCasePage />);
    await openComparison(user);

    // 20% of the $1,500 saved is $300. 20% of the $500 corrected bill
    // would be $100, which is what the old "% of the adjusted bill"
    // wording told the customer to expect.
    expect(await screen.findByText(/\$300/)).toBeInTheDocument();
    expect(screen.getByText(/of the \$1,500 we saved you/)).toBeInTheDocument();
    // "Adjusted Bill" is a legitimate heading on this screen; what must
    // not come back is the fee being stated as a share of it.
    expect(screen.queryByText(/% of the adjusted bill/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$100/)).not.toBeInTheDocument();
  });

  it("states the basis when the saving is not known yet", async () => {
    mock.reset();
    mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mock.queueResult("cases", { data: [{ ...CASE_ROW, adjusted_total: 500 }], error: null });
    mock.queueResult("app_settings", { data: { success_fee_percentage: 20 }, error: null });

    const user = userEvent.setup();
    render(<ActiveCasePage />);
    await openComparison(user);

    expect(await screen.findByText(/never of the corrected bill/)).toBeInTheDocument();
  });

  it("says nothing about the fee when the percentage could not be read", async () => {
    // It used to default to 30 in state, so a failed settings read put
    // "30%" on screen while the server charged the real percentage.
    mock.reset();
    mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mock.queueResult("cases", {
      data: [{ ...CASE_ROW, savings_found: 1500, adjusted_total: 500 }],
      error: null,
    });
    mock.queueResult("app_settings", { data: null, error: { message: "unavailable" } });

    const user = userEvent.setup();
    render(<ActiveCasePage />);
    await openComparison(user);

    expect(screen.queryByText(/Our fee is/)).not.toBeInTheDocument();
    expect(screen.queryByText(/30%/)).not.toBeInTheDocument();
  });
});

// Reported on 2026-11-13, after a provider was replied to as a test: the
// customer got the "your provider responded" email, opened the case, and
// the reply was nowhere on the screen — the Provider Responses row still
// read "Pending".
//
// The reply is an email on the engine's thread, not a file anyone
// uploads, so nothing in the document list was ever going to carry it.
const REPLY = {
  id: "msg-2",
  direction: "INBOUND" as const,
  sender: "billing@matthewwalker.example",
  recipient: "advocate@billfixr.com",
  subject: "Re: Formal Billing Dispute",
  content_markdown:
    "Dispute accepted ,new bill will be sent\n\nThanks\n\nOn Fri, Nov 13, 2026, 8:44 PM BillFixr Advocate <advocate@billfixr.com>\nwrote:\n\n> Formal Billing Dispute",
  status: "RECEIVED",
  created_at: "2026-11-13T20:46:46Z",
};

const OUR_LETTER = {
  id: "msg-1",
  direction: "OUTBOUND" as const,
  sender: "advocate@billfixr.com",
  recipient: "billing@matthewwalker.example",
  subject: "Formal Billing Dispute",
  content_markdown: "Dear Billing Team, we dispute this bill.",
  status: "SENT",
  created_at: "2026-11-13T20:44:32Z",
};

function withNegotiation(messages: unknown[], status = "HELD_FOR_REVIEW") {
  mock.reset();
  mock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mock.queueResult("cases", {
    data: [{ ...CASE_ROW, negotiation_id: "neg-1", bill_id: "bill-1" }],
    error: null,
  });
  mock.queueResult("app_settings", { data: { success_fee_percentage: 20 }, error: null });
  mock.queueResult("letter_events", { data: [], error: null });
  mock.queueResult("case_documents", { data: [], error: null });
  global.fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: "neg-1",
          status,
          total_billed: 1818.13,
          settled_amount: null,
          updated_at: "2026-11-13T20:46:47Z",
          revised_bill_available: false,
          messages,
        }),
        { status: 200 },
      ),
  ) as typeof fetch;
}

describe("the provider's reply", () => {
  it("shows what the provider wrote", async () => {
    withNegotiation([OUR_LETTER, REPLY]);
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));

    expect(await screen.findByText(/Dispute accepted ,new bill will be sent/)).toBeInTheDocument();
    expect(screen.getByText(/billing@matthewwalker.example/)).toBeInTheDocument();
  });

  it("does not read our own letter back to them inside it", async () => {
    // The reply carries our dispute quoted underneath — three thousand
    // characters of our words around one sentence of theirs.
    withNegotiation([OUR_LETTER, REPLY]);
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));
    await screen.findByText(/Dispute accepted/);

    expect(screen.queryByText(/wrote:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dear Billing Team/)).not.toBeInTheDocument();
  });

  it("stops the Provider Responses row claiming nothing has come back", async () => {
    withNegotiation([OUR_LETTER, REPLY]);
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));
    await screen.findByText(/Dispute accepted/);

    const row = screen.getByText("Provider Responses").closest("div")?.parentElement?.parentElement;
    expect(row).toBeTruthy();
    expect(row!.textContent).toContain("Received");
    expect(row!.textContent).not.toContain("Not yet available");
  });

  it("gives the engine's notice in full, not just its headline", async () => {
    // The subject is "Hospital agreed - we are checking it before
    // confirming". The body is the part that says what they agreed to
    // and that nothing is at risk, and only the subject was shown.
    const notice = {
      id: "msg-3",
      direction: "SYSTEM" as const,
      sender: "engine",
      recipient: "client",
      subject: "Hospital agreed - we are checking it before confirming",
      content_markdown:
        "The hospital agreed to $112.49. One of our findings still needs a person to review it, so we are confirming the details before we accept on your behalf. Nothing is lost and no deadline is running.",
      status: "SENT",
      created_at: "2026-11-13T20:46:47Z",
    };
    withNegotiation([OUR_LETTER, REPLY, notice]);
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));

    expect(await screen.findByText(/Hospital agreed - we are checking it/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is lost and no deadline is running/)).toBeInTheDocument();
  });

  it("says nothing when the provider has not written back", async () => {
    withNegotiation([OUR_LETTER], "DISPATCHED");
    const user = userEvent.setup();
    render(<ActiveCasePage />);

    await user.click(await screen.findByText("bill.pdf"));
    await screen.findByText("Bill Analyzed");

    // Not "no reply yet" dressed up as one: our own outbound letter must
    // never be shown as if the provider had sent it.
    expect(screen.queryByText(/Your provider's reply/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Dear Billing Team/)).not.toBeInTheDocument();
  });
});
