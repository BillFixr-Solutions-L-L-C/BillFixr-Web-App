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
    for (const label of ["Client Name", "Email", "Client Hospital Account Number", "Hospital Name", "Billing Department Email", "Hospital Support Email", "Billing Phone Number"]) {
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
    expect(screen.getByLabelText(/^Billing Department Email/)).toHaveValue("");
    expect(screen.getByLabelText(/^Hospital Support Email/)).toHaveValue("");
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

    await waitFor(() => expect(screen.getByLabelText(/^Billing Department Email/)).toHaveValue("billing@riverside.com"));
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
    expect(JSON.parse(call[1].body)).toMatchObject({ field: "supportEmail", hospitalName: "Riverside General" });
  });

  it("says nothing under the field about where the email came from", async () => {
    // The lookup used to name the domain it found the address on, so the
    // customer could see why it was accepted. Removed on request
    // 2026-11-18: it read like a log line on a form. The route still
    // reports emailSource; nothing shows it.
    mockFetch({
      extract: BILL_READ,
      contact: { status: 200, body: { ok: true, value: "billing@mwchc.org", emailSource: "mwchc.org" } },
    });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    await waitFor(() => expect(screen.getByLabelText(/^Billing Department Email/)).toHaveValue("billing@mwchc.org"));
    expect(screen.queryByText(/mwchc\.org/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/check it's right/i)).not.toBeInTheDocument();
  });

  it("will not search until the hospital address is filled in", async () => {
    // The reason the button waits: one hospital name covers facilities in
    // different towns. Matthew Walker is in Nashville AND in Smyrna, and
    // the registry matches a name prefix nationwide, so a name-only search
    // returns the wrong campus and looks certain about it.
    const user = userEvent.setup();
    renderStep({ ...BLANK, hospitalName: "Matthew Walker" });

    const buttons = screen.getAllByRole("button", { name: /Search by AI/ });
    expect(buttons[0]).toBeDisabled();
    expect(screen.getAllByText(/Add the hospital's address first/i).length).toBe(2);

    await user.click(buttons[0]);
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.map(([u]) => String(u));
    expect(calls.some((u) => u.endsWith("/find-contact"))).toBe(false);
  });

  it("enables the search once there is an address", async () => {
    renderStep({ ...BLANK, hospitalName: "Matthew Walker", hospitalAddress: "Smyrna, TN 37167" });

    expect(screen.getAllByRole("button", { name: /Search by AI/ })[0]).toBeEnabled();
    expect(screen.queryByText(/Add the hospital's address first/i)).not.toBeInTheDocument();
  });

  it("fills the billing phone and keeps the lookup's workings off the screen", async () => {
    // No email is the normal answer -- the federal registry has no email
    // field at all. The phone number it does return belongs in the phone
    // box, not in a block of findings under the email field.
    mockFetch({
      extract: {
        ok: true,
        body: { ok: true, fields: { hospitalName: "Matthew Walker", hospitalAddress: "Smyrna, TN 37167" } },
      },
      contact: {
        status: 200,
        body: {
          ok: true,
          value: null,
          fallback: {
            providerName: "Matthew Walker Comprehensive Health Center",
            phone: "615-327-9400",
            billingUrl: "https://example.test/billing",
            notes: "Found in the federal NPI registry (NPI 1164590386).",
            mailingAddress: "1035 14TH AVE N, NASHVILLE, TN 37208",
            facilityType: "Clinic or Health Center",
            npi: "1164590386",
            otherMatches: [
              {
                name: "Matthew Walker Smyrna",
                facilityType: "Clinic or Health Center",
                mailingAddress: "209 LOWRY ST, SMYRNA, TN",
                phone: "615-220-5995",
                city: "SMYRNA",
                state: "TN",
              },
            ],
          },
        },
      },
    });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("Smyrna, TN 37167"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    await waitFor(() => expect(screen.getByLabelText(/^Billing Phone Number/)).toHaveValue("615-327-9400"));

    // Nothing is said about any of it. The phone reaching its box is the
    // whole of the feedback now.
    expect(screen.queryByText(/filled in the billing phone/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/doesn't publish a billing email/i)).not.toBeInTheDocument();

    // The lookup's workings stay off the screen, as they always did.
    expect(screen.queryByText(/NPI registry record/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not the right one/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Matthew Walker Smyrna/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /billing page/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Clinic or Health Center/)).not.toBeInTheDocument();
  });

  it("leaves a phone box that was already filled alone", async () => {
    // BILL_READ puts a billing phone on the form, so the registry's
    // number must not replace it.
    mockFetch({
      extract: BILL_READ,
      contact: { status: 200, body: { ok: true, value: null, fallback: { providerName: "Riverside General", phone: "615-396-4100" } } },
    });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    await waitFor(() => expect(screen.getByLabelText(/^Billing Phone Number/)).toHaveValue("555-0100"));
    expect(screen.queryByText(/doesn't publish a billing email/i)).not.toBeInTheDocument();
  });

  it("puts the engine's registry record in the boxes it belongs in", async () => {
    // The whole point of the button for most hospitals. No published email
    // exists for them, but the federal registry still knows the facility's
    // billing address and phone -- and all of that used to be fetched and
    // discarded, which is why the button looked like it did nothing.
    mockFetch({
      extract: BILL_READ,
      contact: {
        status: 200,
        body: {
          ok: true,
          value: null,
          fallback: {
            providerName: "Matthew Walker Comprehensive Health Center",
            mailingAddress: "739 PRESIDENT PL, SMYRNA, TN 37167",
            phone: "615-984-4290",
            verificationStatus: "verified",
          },
        },
      },
    });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    // A human-checked entry outranks what the form already held.
    await waitFor(() =>
      expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("739 PRESIDENT PL, SMYRNA, TN 37167"),
    );
    expect(screen.getByLabelText(/^Billing Phone Number/)).toHaveValue("615-984-4290");
    // Silently. The boxes changing is what the customer sees.
    expect(screen.queryByText(/from the provider registry/i)).not.toBeInTheDocument();
  });

  it("a registry name-prefix match never overwrites what the customer typed", async () => {
    // The Matthew Walker incident: the registry matches a name prefix
    // nationwide, so a Smyrna bill can match the Nashville campus. A
    // "listed" record may fill a blank box, never replace an address read
    // off the customer's own bill.
    mockFetch({
      extract: BILL_READ,
      contact: {
        status: 200,
        body: {
          ok: true,
          value: null,
          fallback: {
            providerName: "Matthew Walker Comprehensive Health Center",
            mailingAddress: "1035 14TH AVE N, NASHVILLE, TN 37208",
            phone: "615-327-9400",
            verificationStatus: "listed",
          },
        },
      },
    });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    // Both already held a value from the bill, so both are left alone.
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));
    expect(screen.getByLabelText(/^Billing Phone Number/)).toHaveValue("555-0100");
  });

  it("fills in an address the engine could not confirm, without flagging it", async () => {
    // The point of the change: four real hospitals publish a billing
    // address that this fetcher cannot verify -- one blocks it, one has a
    // broken TLS chain, one uses a different mail domain, one renders the
    // address with JavaScript. Showing the customer an empty box helped
    // nobody. They have a browser and can open the page we could not.
    mockFetch({
      extract: BILL_READ,
      contact: {
        status: 200,
        body: {
          ok: true,
          value: "patientbilling@partners.org",
          emailSource: "massgeneralbrigham.org",
          emailConfirmed: false,
          emailUnconfirmedReason: "it is published on massgeneralbrigham.org, not on its own domain",
        },
      },
    });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    // Filled, not withheld.
    await waitFor(() =>
      expect(screen.getByLabelText(/^Billing Department Email/)).toHaveValue("patientbilling@partners.org"),
    );
    // It used to be labelled "not confirmed", with the reason. That line
    // went with the rest on 2026-11-18, so an unconfirmed address now
    // arrives looking exactly like a confirmed one.
    expect(screen.queryByText(/not confirmed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not on its own domain/i)).not.toBeInTheDocument();
  });

  it("says nothing at all when it finds no hospital", async () => {
    // This used to separate "found the hospital, could not confirm an
    // email" from "no such hospital" -- different problems, and only the
    // second is one the customer can fix. Both are silent now.
    mockFetch({ extract: BILL_READ, contact: { status: 200, body: { ok: true, value: null } } });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    await waitFor(() => expect(screen.queryByText(/Searching/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/No match for that hospital/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/doesn't publish a billing email/i)).not.toBeInTheDocument();
    // The box is left for them to type into, which is the only thing left
    // to do.
    expect(screen.getByLabelText(/^Billing Department Email/)).toHaveValue("");
  });

  it("still lets them type it in when the lookup isn't available", async () => {
    mockFetch({
      extract: BILL_READ,
      contact: { status: 503, body: { error: "Automatic search isn't available right now — please type it in." } },
    });
    const user = userEvent.setup();
    renderStep();
    await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

    await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);

    // The 503's wording used to render under the field. It does not any
    // more -- the button simply stops spinning and the box stays empty.
    await waitFor(() => expect(screen.queryByText(/Searching/i)).not.toBeInTheDocument());
    expect(screen.queryByText(/Automatic search isn't available/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Billing Department Email/)).toBeInTheDocument();
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
  // The lookup says nothing under the field, whatever it finds.
  //
  // Removed on request 2026-11-18: the line it used to render read like a
  // log entry on a form. The tests above each name the phrase they expect
  // gone, which is not enough on its own -- a differently worded note would
  // slip past all of them. This one refuses any commentary at all.
  describe("the lookup narrates nothing", () => {
    // The note was the only <p> of this shape under a field, so matching
    // on the element rather than on wording is what makes this hold
    // against a differently worded one. An earlier version of this test
    // named the phrases it expected gone, and a note reading "Found on
    // example.org" walked straight past every one of them.
    //
    // The same class carries the "add the hospital's address first" hint,
    // which is why each of these fills the address in before searching:
    // with an address present that hint is gone, so any <p> left is a note.
    const NOTE = "p.mt-1.text-xs.text-gray-500";

    const RESPONSES: [string, Record<string, unknown>][] = [
      ["an email it confirmed", { ok: true, value: "billing@mwchc.org", emailSource: "mwchc.org", emailConfirmed: true }],
      [
        "an email it could not confirm",
        {
          ok: true,
          value: "billing@partners.org",
          emailSource: "partners.org",
          emailConfirmed: false,
          emailUnconfirmedReason: "it is published on another domain",
        },
      ],
      [
        "no email but a registry record",
        {
          ok: true,
          value: null,
          fallback: { providerName: "Matthew Walker", phone: "615-327-9400", mailingAddress: "1035 14TH AVE N" },
        },
      ],
      ["no match at all", { ok: true, value: null }],
    ];

    for (const [what, body] of RESPONSES) {
      it(`stays silent on ${what}`, async () => {
        mockFetch({ extract: BILL_READ, contact: { status: 200, body } });
        const user = userEvent.setup();
        renderStep();
        await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

        await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);
        await waitFor(() => expect(screen.queryByText(/Searching/i)).not.toBeInTheDocument());

        expect(document.querySelectorAll(NOTE)).toHaveLength(0);
      });
    }

    it("stays silent when the lookup itself fails", async () => {
      mockFetch({
        extract: BILL_READ,
        contact: { status: 503, body: { error: "Automatic search isn't available right now — please type it in." } },
      });
      const user = userEvent.setup();
      renderStep();
      await waitFor(() => expect(screen.getByLabelText(/^Hospital Address/)).toHaveValue("2 Care Rd"));

      await user.click(screen.getAllByRole("button", { name: /Search by AI/ })[0]);
      await waitFor(() => expect(screen.queryByText(/Searching/i)).not.toBeInTheDocument());

      expect(document.querySelectorAll(NOTE)).toHaveLength(0);
    });
  });
});
