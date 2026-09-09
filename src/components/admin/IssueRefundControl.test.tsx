import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import IssueRefundControl from "./IssueRefundControl";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("IssueRefundControl", () => {
  it("renders nothing when canRefund is false", () => {
    render(<IssueRefundControl paymentRecordId="rec-1" refundableAmount={100} canRefund={false} />);
    expect(screen.queryByRole("button", { name: "Refund" })).not.toBeInTheDocument();
  });

  it("prefills the amount with the full refundable amount", () => {
    render(<IssueRefundControl paymentRecordId="rec-1" refundableAmount={42.5} canRefund />);
    expect(screen.getByRole("spinbutton")).toHaveValue(42.5);
  });

  it("does nothing on cancel", async () => {
    global.fetch = vi.fn();
    const user = userEvent.setup();
    render(<IssueRefundControl paymentRecordId="rec-1" refundableAmount={100} canRefund />);

    await user.click(screen.getByRole("button", { name: "Refund" }));
    expect(screen.getByText(/refunds \$100.00 to the customer/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("issues the refund for the entered amount and refreshes on confirm", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const user = userEvent.setup();
    render(<IssueRefundControl paymentRecordId="rec-1" refundableAmount={100} canRefund />);

    await user.clear(screen.getByRole("spinbutton"));
    await user.type(screen.getByRole("spinbutton"), "30");
    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.click(screen.getByRole("button", { name: "Yes, Refund" }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/admin/payments/rec-1/refund",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ amount: 30 }) }),
    );
  });

  it("shows the server error and does not refresh when the refund fails", async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Refund amount must be between $0.01 and the remaining refundable amount." }), { status: 400 }));
    const user = userEvent.setup();
    render(<IssueRefundControl paymentRecordId="rec-1" refundableAmount={100} canRefund />);

    await user.click(screen.getByRole("button", { name: "Refund" }));
    await user.click(screen.getByRole("button", { name: "Yes, Refund" }));

    await waitFor(() =>
      expect(
        screen.getByText("Refund amount must be between $0.01 and the remaining refundable amount."),
      ).toBeInTheDocument(),
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
