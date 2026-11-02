import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CaseInformationStep, { type CaseInformation } from "./CaseInformationStep";

const BLANK: CaseInformation = {
  clientName: "Jane Doe",
  email: "jane@example.com",
  address: "1 Main St",
  clientHospitalNumber: "",
  hospitalName: "",
  billingManagerEmail: "",
  hospitalAddress: "",
  supportEmail: "",
  billingPhone: "",
};

// Every field filled, so the step is ready to continue.
const COMPLETE: CaseInformation = {
  ...BLANK,
  clientHospitalNumber: "45962",
  hospitalName: "General",
  billingManagerEmail: "b@h.com",
  hospitalAddress: "2 Care Rd",
  supportEmail: "s@h.com",
  billingPhone: "555-0100",
};

const originalFetch = global.fetch;

// The only call this step makes now is the save. Reading the bill on
// open and the two "Search by AI" lookups went with the AI services.
function mockFetch() {
  global.fetch = vi.fn(
    async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
  ) as unknown as typeof fetch;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch();
});
afterEach(() => {
  global.fetch = originalFetch;
});

function renderStep(initial: CaseInformation = BLANK, onContinue = vi.fn()) {
  render(<CaseInformationStep billId="bill-1" initial={initial} previews={[]} onContinue={onContinue} />);
  return onContinue;
}

describe("CaseInformationStep", () => {
  it("shows both sections with the renamed fields", () => {
    renderStep();
    expect(screen.getByText("Personal Information")).toBeInTheDocument();
    expect(screen.getByText("Hospital Information")).toBeInTheDocument();
    for (const label of ["Client Name", "Email", "Client Hospital Account Number", "Hospital Name", "Billing Department Email", "Hospital Support Email", "Billing Phone Number"]) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/NextGen/)).not.toBeInTheDocument();
  });

  it("asks the customer for the two email addresses, with no lookup offered", async () => {
    // There is no backend that can find these any more, so the step must
    // not imply one: no "Search by AI" button, and the fields are the
    // customer's to fill.
    renderStep();
    expect(screen.queryByRole("button", { name: /Search by AI/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Billing Department Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Support Email/i)).toBeInTheDocument();
  });

  it("makes no network call just by opening", async () => {
    // It used to POST /extract on mount to read the bill.
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/Hospital Name/i)).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("blocks continuing while fields are blank, and says how many are left", async () => {
    renderStep();

    expect(screen.getByRole("button", { name: "Save Information" })).toBeDisabled();
    expect(screen.getByText(/Fill in all \d+ remaining required fields/)).toBeInTheDocument();
  });

  it("still blocks on a single missing field, and names it", async () => {
    renderStep({ ...COMPLETE, billingPhone: "" });

    expect(screen.getByRole("button", { name: "Save Information" })).toBeDisabled();
    expect(screen.getByText(/Add Billing Phone Number before scanning/)).toBeInTheDocument();
  });

  it("continues once every field is filled", async () => {
    const user = userEvent.setup();
    const onContinue = renderStep(COMPLETE);

    const button = screen.getByRole("button", { name: "Save Information" });
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it("lets a blank field be typed in and unblocks", async () => {
    const user = userEvent.setup();
    renderStep({ ...COMPLETE, billingPhone: "" });

    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await user.type(screen.getByLabelText(/^Billing Phone Number/), "555-0100");

    expect(screen.getByRole("button", { name: "Save Information" })).toBeEnabled();
  });

  it("marks the required fields", async () => {
    renderStep();
    expect(document.querySelector('label[for="info-clientName"]')?.textContent).toContain("*");
    // every field except the read-only Email
    expect(document.querySelectorAll("label span.text-danger")).toHaveLength(8);
  });

  it("keeps fields read-only until Edit is pressed, and email always", async () => {
    const user = userEvent.setup();
    renderStep();

    expect(screen.getByLabelText(/^Hospital Name/)).toHaveAttribute("readonly");
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(screen.getByLabelText(/^Hospital Name/)).not.toHaveAttribute("readonly");

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
  });

  it("sends the renamed fields when saving", async () => {
    const user = userEvent.setup();
    renderStep(COMPLETE);

    await user.click(screen.getByRole("button", { name: "Save Information" }));

    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(0));
    const saveCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(saveCall[0]).toBe("/api/dashboard/bills/bill-1/information");
    expect(JSON.parse(saveCall[1].body)).toMatchObject({
      supportEmail: "s@h.com",
      clientHospitalNumber: "45962",
      billingPhone: "555-0100",
    });
  });
});
