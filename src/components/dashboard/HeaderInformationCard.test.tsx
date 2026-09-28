import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HeaderInformationCard from "./HeaderInformationCard";
import { HEADER_FIELD_DEFS } from "@/lib/headerInfo";

const VALUES: Record<string, string> = {
  memberName: "Jane Doe",
  memberId: "No member ID found",
  group: "No group found",
  claimNumber: "C-55",
  providerName: "General Hospital",
  accountNumber: "A-77",
  serviceDate: "2026-07-14",
  statementDate: "Not found",
};
const FIELDS = HEADER_FIELD_DEFS.map((d) => ({ ...d, value: VALUES[d.key] }));
const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  global.fetch = originalFetch;
});

describe("HeaderInformationCard", () => {
  it("shows the AI-filled values", () => {
    render(<HeaderInformationCard fields={FIELDS} billId="bill-1" />);
    expect(screen.getByText("General Hospital")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("No member ID found")).toBeInTheDocument();
  });

  it("has no Edit button when there is no analysis to edit", () => {
    render(<HeaderInformationCard fields={FIELDS} billId={null} />);
    expect(screen.queryByRole("button", { name: /Edit/ })).not.toBeInTheDocument();
  });

  it("opens inputs prefilled with real values, and blank for 'not found' ones", async () => {
    const user = userEvent.setup();
    render(<HeaderInformationCard fields={FIELDS} billId="bill-1" />);
    await user.click(screen.getByRole("button", { name: /Edit/ }));

    expect(screen.getByLabelText("Provider name")).toHaveValue("General Hospital");
    expect(screen.getByLabelText("Member ID")).toHaveValue("");
    expect(screen.getByLabelText("Member ID")).toHaveAttribute("placeholder", "No member ID found");
    expect(screen.getByLabelText("Date of service")).toHaveAttribute("type", "date");
  });

  it("saves the edited values and shows them afterwards", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<HeaderInformationCard fields={FIELDS} billId="bill-1" />);
    await user.click(screen.getByRole("button", { name: /Edit/ }));

    const provider = screen.getByLabelText("Provider name");
    await user.clear(provider);
    await user.type(provider, "St. Mary Medical");
    await user.type(screen.getByLabelText("Member ID"), "M-999");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.getByText("St. Mary Medical")).toBeInTheDocument());
    expect(screen.getByText("M-999")).toBeInTheDocument();
    expect(screen.getByText("Saved.")).toBeInTheDocument();
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/dashboard/documents/bill-1/header-info");
    expect(JSON.parse(init.body)).toMatchObject({ providerName: "St. Mary Medical", memberId: "M-999", group: "" });
  });

  it("falls back to the standard 'not found' text when a field is cleared", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<HeaderInformationCard fields={FIELDS} billId="bill-1" />);
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.clear(screen.getByLabelText("Provider name"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(screen.queryByText("General Hospital")).not.toBeInTheDocument());
    expect(screen.getAllByText("Not found").length).toBeGreaterThan(0);
  });

  it("keeps the inputs open and shows the server's error when saving fails", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "Dates must be valid (YYYY-MM-DD)." }), { status: 400 }),
    );
    const user = userEvent.setup();
    render(<HeaderInformationCard fields={FIELDS} billId="bill-1" />);
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Dates must be valid (YYYY-MM-DD).")).toBeInTheDocument();
    expect(screen.getByLabelText("Provider name")).toBeInTheDocument();
  });

  it("discards changes on Cancel", async () => {
    const user = userEvent.setup();
    render(<HeaderInformationCard fields={FIELDS} billId="bill-1" />);
    await user.click(screen.getByRole("button", { name: /Edit/ }));
    await user.type(screen.getByLabelText("Provider name"), " EXTRA");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("General Hospital")).toBeInTheDocument();
    expect(screen.queryByText(/EXTRA/)).not.toBeInTheDocument();
  });
});
