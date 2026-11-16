import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CounterOfferPanel from "./CounterOfferPanel";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const LETTER =
  "Dear Billing Team, further to our dispute of this account we are able to offer the following settlement.";

beforeEach(() => {
  vi.clearAllMocks();
});

function panel({ canAct = true, autopilotOn = true } = {}) {
  return (
    <CounterOfferPanel
      caseId="case-1"
      patientBalance={428.53}
      currentOffer={112.49}
      autopilotOn={autopilotOn}
      canAct={canAct}
    />
  );
}

describe("the autopilot brake", () => {
  it("says what the automation is currently doing", () => {
    render(panel({ autopilotOn: true }));
    expect(screen.getByText(/replying automatically/i)).toBeInTheDocument();
  });

  it("turns it off and reflects the new state", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(panel({ autopilotOn: true }));

    await user.click(screen.getByRole("button", { name: "Turn off" }));

    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/cases/case-1/negotiation/counter");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ enabled: false });
    expect(await screen.findByText(/nothing goes out on its own/i)).toBeInTheDocument();
  });

  it("leaves the state alone when the server refuses", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "nope" }), { status: 502 }),
    ) as typeof fetch;
    render(panel({ autopilotOn: true }));

    await user.click(screen.getByRole("button", { name: "Turn off" }));

    expect(await screen.findByText("nope")).toBeInTheDocument();
    expect(screen.getByText(/replying automatically/i)).toBeInTheDocument();
  });
});

describe("writing a counter-offer", () => {
  it("sends the amount and the letter", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    render(panel());

    await user.click(screen.getByRole("button", { name: "Write a counter-offer" }));
    await user.type(screen.getByLabelText(/Amount to offer/), "150");
    await user.type(screen.getByLabelText(/Letter to the provider/), LETTER);
    await user.click(screen.getByRole("button", { name: "Send to the provider" }));

    const [, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ amount: 150, letter: LETTER });
    expect(await screen.findByText(/Counter-offer sent/)).toBeInTheDocument();
  });

  it("will not send an empty letter", async () => {
    // It would reach a hospital exactly as given.
    const user = userEvent.setup();
    global.fetch = vi.fn();
    render(panel());

    await user.click(screen.getByRole("button", { name: "Write a counter-offer" }));
    await user.type(screen.getByLabelText(/Amount to offer/), "150");

    expect(screen.getByRole("button", { name: "Send to the provider" })).toBeDisabled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("will not offer more than the client already owes", async () => {
    const user = userEvent.setup();
    global.fetch = vi.fn();
    render(panel());

    await user.click(screen.getByRole("button", { name: "Write a counter-offer" }));
    await user.type(screen.getByLabelText(/Amount to offer/), "500");
    await user.type(screen.getByLabelText(/Letter to the provider/), LETTER);

    expect(screen.getByText(/client already owes/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send to the provider" })).toBeDisabled();
  });

  it("warns that the letter goes out exactly as typed", async () => {
    const user = userEvent.setup();
    render(panel());

    await user.click(screen.getByRole("button", { name: "Write a counter-offer" }));

    expect(screen.getByText(/exactly as typed/i)).toBeInTheDocument();
  });

  it("is unavailable without full access to the negotiation domain", () => {
    render(panel({ canAct: false }));

    expect(screen.getByRole("button", { name: "Write a counter-offer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Turn off" })).toBeDisabled();
    expect(screen.getByText(/do not have full access/i)).toBeInTheDocument();
  });
});
