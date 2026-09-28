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

// Two different endpoints now: /extract reads the bill on open, and
// /find-contact backs the two "Search by AI" buttons. Anything else (the
// save) is a plain success.
function mockFetch(opts: {
  extract?: { ok: boolean; body: unknown };
  contact?: { status: number; body: unknown };
} = {}) {
  global.fetch = vi.fn(async (url: string) => {
    if (String(url).endsWith("/extract")) {
      const e = opts.extract ?? { ok: true, body: { ok: true, fields: {} } };
      return new Response(JSON.stringify(e.body), { status: e.ok ? 200 : 502 });
    }
    if (String(url).endsWith("/find-contact")) {
      const c = opts.contact ?? { status: 200, body: { ok: true, value: null } };
      return new Response(JSON.stringify(c.body), { status: c.status });
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

  const BILL_READ = {
    ok: true,
    body: {
      ok: true,
      fields: {
        clientName: "AI Patient",
        hospitalName: "Riverside General",
        hospitalAddress: "2 Care Rd",
        billingPhone: "555-0100",
      },
    },
  };

  it("reads what's on the bill as soon as the step opens", async () => {
    mockFetch({ extract: BILL_READ });
    renderStep({ ...BLANK, clientName: "" });

    await waitFor(() => expect(screen.getByLabelText(/^Hospital Name/)).toHaveValue("Riverside General"));
    expect(screen.getByLabelText(/^Billing Phone Number/)).toHaveValue("555-0100");
    expect(screen.getByLabelText(/^Client Name/)).toHaveValue("AI Patient");
  });

  it("leaves the two email fields for the lookup, not the bill read", async () => {
    mockFetch({ extract: BILL_READ });
    renderStep();

    await waitFor(() => expect(screen.getByLabelText(/^Hospital Name/)).toHaveValue("Riverside General"));
    expect(screen.getByLabelText(/^Billing Manager Email/)).toHaveValue("");
    expect(screen.getByLabelText(/^Support Email/)).toHaveValue("");
  });

  it("never overwrites a value the customer already has when reading the bill", async () => {
    mockFetch({ extract: BILL_READ });
    renderStep({ ...BLANK, hospitalName: "Typed By Customer" });

    await waitFor(() => expect(screen.getByLabelText(/^Billing Phone Number/)).toHaveValue("555-0100"));
    expect(screen.getByLabelText(/^Hospital Name/)).toHaveValue("Typed By Customer");
  });

  it("looks the address up when Search by AI is pressed, not from the bill", async () => {
    mockFetch({ extract: BILL_READ, contact: { status: 200, body: { ok: true, value: "billing@riverside.com" } } });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Name/)).toHaveValue("Riverside General"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    await waitFor(() => expect(screen.getByLabelText(/^Billing Manager Email/)).toHaveValue("billing@riverside.com"));
    expect(screen.getByText(/Found — check it's right/i)).toBeInTheDocument();
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => String(u));
    expect(calls.some((u) => u.endsWith("/find-contact"))).toBe(true);
  });

  it("asks for each field separately", async () => {
    mockFetch({ extract: BILL_READ, contact: { status: 200, body: { ok: true, value: "x@y.com" } } });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Name/)).toHaveValue("Riverside General"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[1]);

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.find(([u]) => String(u).endsWith("/find-contact"))!;
    expect(JSON.parse(call[1].body)).toEqual({ field: "supportEmail" });
  });

  it("says so when no address could be found", async () => {
    mockFetch({ extract: BILL_READ, contact: { status: 200, body: { ok: true, value: null } } });
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);
    expect(await screen.findByText(/couldn't find an address for this hospital/i)).toBeInTheDocument();
  });

  it("reports a lookup that isn't available, and still lets them type it", async () => {
    mockFetch({
      extract: BILL_READ,
      contact: { status: 503, body: { error: "Automatic search isn't available right now — please type it in." } },
    });
    const user = userEvent.setup();
    renderStep();

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    expect(await screen.findByText(/Automatic search isn't available right now/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Billing Manager Email/)).toBeInTheDocument();
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
