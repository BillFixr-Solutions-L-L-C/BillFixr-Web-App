import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AcceptSettlementPanel from "./AcceptSettlementPanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

// $428.53 is what the client owes; $112.49 is what the provider agreed.
function panel({ canAccept = true, currentOffer = 112.49 as number | null } = {}) {
  return (
    <AcceptSettlementPanel caseId="case-1" patientBalance={428.53} currentOffer={currentOffer} canAccept={canAccept} />
  );
}

describe("recording a settlement", () => {
  it("sends the figure the admin entered", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(panel());

    await user.click(screen.getByRole("button", { name: /Accept on the client/ }));

    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/cases/case-1/negotiation/accept-settlement");
    expect(JSON.parse(init.body)).toEqual({ amount: 112.49 });
    expect(await screen.findByText(/Settlement recorded/)).toBeInTheDocument();
  });

  it("shows what the client saves before anything is sent", async () => {
    // The consequence of the number in the box, while it is still being
    // typed: 428.53 - 112.49.
    render(panel());

    expect(screen.getByText(/\$316\.04/)).toBeInTheDocument();
  });

  it("refuses a figure that is not a reduction", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();
    render(panel({ currentOffer: null }));

    await user.type(screen.getByLabelText(/Amount/), "500");

    expect(screen.getByText(/not a reduction/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Accept on the client/ })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("will not send an empty amount, so the engine's hardcoded default is unreachable", async () => {
    // POST /accept falls back to 175.00 when given nothing.
    global.fetch = vi.fn();
    render(panel({ currentOffer: null }));

    expect(screen.getByRole("button", { name: /Accept on the client/ })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the server's refusal rather than claiming it worked", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "This case has already been settled." }), { status: 409 }),
    ) as typeof fetch;
    render(panel());

    await user.click(screen.getByRole("button", { name: /Accept on the client/ }));

    expect(await screen.findByText("This case has already been settled.")).toBeInTheDocument();
    expect(screen.queryByText(/Settlement recorded/)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is disabled without full access to the negotiation domain", () => {
    render(panel({ canAccept: false }));

    expect(screen.getByRole("button", { name: /Accept on the client/ })).toBeDisabled();
    expect(screen.getByText(/do not have full access/i)).toBeInTheDocument();
  });
});
