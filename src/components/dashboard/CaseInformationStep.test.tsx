import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CaseInformationStep, { type CaseInformation } from "./CaseInformationStep";

const INITIAL: CaseInformation = {
  clientName: "Jane Doe",
  email: "jane@example.com",
  address: "1 Main St",
  nextgenNumber: "",
  hospitalName: "",
  billingManagerEmail: "",
  hospitalAddress: "",
  billingPhone: "",
};

const originalFetch = global.fetch;
beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
});
afterEach(() => {
  global.fetch = originalFetch;
});

function renderStep(onContinue = vi.fn()) {
  render(<CaseInformationStep billId="bill-1" initial={INITIAL} previews={[]} onContinue={onContinue} />);
  return onContinue;
}

describe("CaseInformationStep", () => {
  it("shows both sections with the fields from the design", () => {
    renderStep();
    expect(screen.getByText("Personal Information")).toBeInTheDocument();
    expect(screen.getByText("Hospital Information")).toBeInTheDocument();
    for (const label of ["Client Name", "Email", "NextGen Number", "Hospital Name", "Billing Manager Email", "Billing Phone Number"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it("prefills what we already know about the customer", () => {
    renderStep();
    expect(screen.getByLabelText("Client Name")).toHaveValue("Jane Doe");
    expect(screen.getByLabelText("Email")).toHaveValue("jane@example.com");
  });

  it("keeps fields read-only until Edit is pressed", async () => {
    const user = userEvent.setup();
    renderStep();
    expect(screen.getByLabelText("Hospital Name")).toHaveAttribute("readonly");

    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(screen.getByLabelText("Hospital Name")).not.toHaveAttribute("readonly");
  });

  it("never allows the email to be edited", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
  });

  it("saves a section and reports it", async () => {
    const user = userEvent.setup();
    renderStep();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await user.type(screen.getByLabelText("Hospital Name"), "General Hospital");
    await user.click(screen.getAllByRole("button", { name: "Save" })[1]);

    await waitFor(() => expect(screen.getByText("Information saved.")).toBeInTheDocument());
    const [url, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/dashboard/bills/bill-1/information");
    expect(JSON.parse(init.body)).toMatchObject({ hospitalName: "General Hospital", clientName: "Jane Doe" });
  });

  it("saves and then continues when Save Information is pressed", async () => {
    const user = userEvent.setup();
    const onContinue = renderStep();
    await user.click(screen.getByRole("button", { name: "Save Information" }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it("does not continue when saving fails, and shows the reason", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ error: "Enter a valid billing manager email." }), { status: 400 }),
    );
    const user = userEvent.setup();
    const onContinue = renderStep();
    await user.click(screen.getByRole("button", { name: "Save Information" }));

    expect(await screen.findByText("Enter a valid billing manager email.")).toBeInTheDocument();
    expect(onContinue).not.toHaveBeenCalled();
  });
});
