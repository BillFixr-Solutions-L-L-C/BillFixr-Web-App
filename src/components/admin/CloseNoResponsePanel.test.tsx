import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CloseNoResponsePanel from "./CloseNoResponsePanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  vi.clearAllMocks();
});

function panel(canClose = true) {
  return (
    <CloseNoResponsePanel caseId="case-1" followUpsSent={3} lastContactAt="2026-11-01T00:00:00Z" canClose={canClose} />
  );
}

// The route behind this has been complete and correct for some time and
// nothing called it, so a hospital that simply ignores us left the case
// at "awaiting a reply" forever while the customer was told we were
// chasing.
describe("closing a case nobody answered", () => {
  it("asks for confirmation before it closes anything", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();
    render(panel());

    await user.click(screen.getByRole("button", { name: "Close — no response" }));

    expect(screen.getByRole("button", { name: "Close the case" })).toBeInTheDocument();
    // Nothing has been sent yet: the first click only opens the confirm.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("closes the case and passes the reason the admin typed", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })) as typeof fetch;
    render(panel());

    await user.click(screen.getByRole("button", { name: "Close — no response" }));
    await user.type(screen.getByLabelText(/Reason/), "billing office said they never reply in writing");
    await user.click(screen.getByRole("button", { name: "Close the case" }));

    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/cases/case-1/negotiation/close-no-response");
    expect(JSON.parse(init.body)).toEqual({ reason: "billing office said they never reply in writing" });
    expect(await screen.findByText(/Case closed/)).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it("sends no reason rather than an empty one", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(panel());

    await user.click(screen.getByRole("button", { name: "Close — no response" }));
    await user.click(screen.getByRole("button", { name: "Close the case" }));

    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({});
  });

  it("tells the client they owe nothing, because there was no reduction", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(panel());

    await user.click(screen.getByRole("button", { name: "Close — no response" }));
    await user.click(screen.getByRole("button", { name: "Close the case" }));

    // The success fee is a share of the saving, and silence produces no
    // saving. Saying so here stops an admin thinking a fee is owed.
    expect(await screen.findByText(/no success fee/i)).toBeInTheDocument();
  });

  it("shows the server's refusal rather than claiming it worked", async () => {
    // The route re-checks both conditions against the engine's live view,
    // so it can refuse a close this panel thought was allowed.
    const user = userEvent.setup();
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: "Only 2 of 3 follow-ups have been sent." }), { status: 409 }),
    ) as typeof fetch;
    render(panel());

    await user.click(screen.getByRole("button", { name: "Close — no response" }));
    await user.click(screen.getByRole("button", { name: "Close the case" }));

    expect(await screen.findByText("Only 2 of 3 follow-ups have been sent.")).toBeInTheDocument();
    expect(screen.queryByText(/Case closed/)).not.toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is disabled without full access to the negotiation domain", () => {
    render(panel(false));

    expect(screen.getByRole("button", { name: "Close — no response" })).toBeDisabled();
    expect(screen.getByText(/do not have full access/i)).toBeInTheDocument();
  });
});
