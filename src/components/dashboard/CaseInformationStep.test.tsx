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

const originalFetch = global.fetch;

// The step asks the AI to read the bill on mount; each test says what that
// returns, then any later call (the save) succeeds.
function mockFetch(extract: { ok: boolean; body: unknown }) {
  let first = true;
  global.fetch = vi.fn(async () => {
    if (first) {
      first = false;
      return new Response(JSON.stringify(extract.body), { status: extract.ok ? 200 : 502 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  });
}

const NOTHING_READ = { ok: true, body: { ok: true, fields: { hospitalName: "", billingManagerEmail: "", hospitalAddress: "", billingPhone: "" } } };

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch(NOTHING_READ);
});
afterEach(() => {
  global.fetch = originalFetch;
});

function renderStep(initial: CaseInformation = BLANK, onContinue = vi.fn()) {
  render(<CaseInformationStep billId="bill-1" initial={initial} previews={[]} onContinue={onContinue} />);
  return onContinue;
}

describe("CaseInformationStep", () => {
  it("shows both sections with the renamed fields", async () => {
    renderStep();
    await waitFor(() => expect(screen.getByText(/couldn't read|filled in what we could/i)).toBeInTheDocument());
    expect(screen.getByText("Personal Information")).toBeInTheDocument();
    expect(screen.getByText("Hospital Information")).toBeInTheDocument();
    for (const label of ["Client Name", "Email", "Client Hospital Number", "Hospital Name", "Billing Manager Email", "Support Email", "Billing Phone Number"]) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/NextGen/)).not.toBeInTheDocument();
  });

  it("fills the hospital fields the AI read off the bill", async () => {
    mockFetch({
      ok: true,
      body: { ok: true, fields: { hospitalName: "Riverside General", billingManagerEmail: "billing@riverside.com", hospitalAddress: "2 Care Rd", billingPhone: "555-0100" } },
    });
    renderStep();

    await waitFor(() => expect(screen.getByLabelText(/^Hospital Name/)).toHaveValue("Riverside General"));
    expect(screen.getByLabelText(/^Billing Manager Email/)).toHaveValue("billing@riverside.com");
    expect(screen.getByText(/filled in what we could read/i)).toBeInTheDocument();
  });

  it("never overwrites a value the customer already has", async () => {
    mockFetch({
      ok: true,
      body: { ok: true, fields: { hospitalName: "AI Hospital", billingManagerEmail: "", hospitalAddress: "", billingPhone: "" } },
    });
    renderStep({ ...BLANK, hospitalName: "Typed By Customer" });

    await waitFor(() => expect(screen.getByText(/filled in what we could read/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^Hospital Name/)).toHaveValue("Typed By Customer");
  });

  it("says so when the bill can't be read, and still lets them fill it in", async () => {
    mockFetch({ ok: false, body: { error: "We couldn't read this document." } });
    renderStep();
    expect(await screen.findByText(/couldn't read your bill automatically/i)).toBeInTheDocument();
  });

  it("blocks continuing until the required fields are there", async () => {
    const user = userEvent.setup();
    const onContinue = renderStep();
    await waitFor(() => expect(screen.getByText(/couldn't read|filled in/i)).toBeInTheDocument());

    const button = screen.getByRole("button", { name: "Save Information" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/Add Hospital Name and Billing Manager Email before scanning/)).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await user.type(screen.getByLabelText(/^Hospital Name/), "Riverside General");
    expect(screen.getByRole("button", { name: "Save Information" })).toBeDisabled();

    await user.type(screen.getByLabelText(/^Billing Manager Email/), "billing@riverside.com");
    expect(screen.getByRole("button", { name: "Save Information" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Save Information" }));
    await waitFor(() => expect(onContinue).toHaveBeenCalled());
  });

  it("marks the required fields", async () => {
    renderStep();
    await waitFor(() => expect(screen.getByText(/couldn't read|filled in/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^Client Name/).closest("div")?.textContent).toContain("*");
  });

  it("keeps fields read-only until Edit is pressed, and email always", async () => {
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByText(/couldn't read|filled in/i)).toBeInTheDocument());

    expect(screen.getByLabelText(/^Hospital Name/)).toHaveAttribute("readonly");
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(screen.getByLabelText(/^Hospital Name/)).not.toHaveAttribute("readonly");

    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByLabelText("Email")).toHaveAttribute("readonly");
  });

  it("sends the renamed fields when saving", async () => {
    const user = userEvent.setup();
    renderStep({ ...BLANK, hospitalName: "H", billingManagerEmail: "b@h.com" });
    await waitFor(() => expect(screen.getByText(/couldn't read|filled in/i)).toBeInTheDocument());

    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    await user.type(screen.getByLabelText(/^Support Email/), "support@h.com");
    await user.click(screen.getByRole("button", { name: "Save Information" }));

    await waitFor(() => expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(1));
    const saveCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(saveCall[0]).toBe("/api/dashboard/bills/bill-1/information");
    expect(JSON.parse(saveCall[1].body)).toMatchObject({ supportEmail: "support@h.com", clientHospitalNumber: "" });
  });
});
