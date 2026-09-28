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

// "Search by AI" hits the extract endpoint; everything else (the save) is
// a plain success.
function mockFetch(extract?: { ok: boolean; body: unknown }) {
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).endsWith("/extract")) {
      const e = extract ?? { ok: true, body: { ok: true, fields: { personal: {}, hospital: {} } } };
      return new Response(JSON.stringify(e.body), { status: e.ok ? 200 : 502 });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
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
  it("has a Search by AI button on each section", () => {
    renderStep();
    expect(screen.getAllByRole("button", { name: /Search by AI/ })).toHaveLength(2);
  });

  it("shows both sections with the renamed fields", () => {
    renderStep();
    expect(screen.getByText("Personal Information")).toBeInTheDocument();
    expect(screen.getByText("Hospital Information")).toBeInTheDocument();
    for (const label of ["Client Name", "Email", "Client Hospital Number", "Hospital Name", "Billing Manager Email", "Support Email", "Billing Phone Number"]) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument();
    }
    expect(screen.queryByLabelText(/NextGen/)).not.toBeInTheDocument();
  });

  const READ_OK = {
    ok: true,
    body: {
      ok: true,
      fields: {
        clientName: "AI Patient",
        hospitalName: "Riverside General",
        billingManagerEmail: "billing@riverside.com",
        supportEmail: "support@riverside.com",
        billingPhone: "555-0100",
      },
    },
  };

  it("does not call the AI until Search by AI is pressed", async () => {
    renderStep();
    await waitFor(() => expect(screen.getByText("Hospital Information")).toBeInTheDocument());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fills the one field its button sits beside", async () => {
    mockFetch(READ_OK);
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    await waitFor(() =>
      expect(screen.getByLabelText(/^Billing Manager Email/)).toHaveValue("billing@riverside.com"),
    );
    // the other searchable field is untouched
    expect(screen.getByLabelText(/^Support Email/)).toHaveValue("");
    expect(screen.getByText(/Found on your bill/i)).toBeInTheDocument();
  });

  it("never overwrites a value the customer already has", async () => {
    mockFetch(READ_OK);
    const user = userEvent.setup();
    renderStep({ ...BLANK, billingManagerEmail: "typed@customer.com" });

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    await waitFor(() => expect(screen.getByText(/Found on your bill/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/^Billing Manager Email/)).toHaveValue("typed@customer.com");
  });

  it("says when the value isn't on the bill", async () => {
    mockFetch({ ok: true, body: { ok: true, fields: { billingManagerEmail: "" } } });
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);
    expect(await screen.findByText(/Couldn't find this on your bill/i)).toBeInTheDocument();
  });

  it("reports when the bill can't be read, and still lets them fill it in", async () => {
    mockFetch({ ok: false, body: { error: "We couldn't read this document." } });
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[1]);

    expect(await screen.findByText("We couldn't read this document.")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Hospital Name/)).toBeInTheDocument();
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
