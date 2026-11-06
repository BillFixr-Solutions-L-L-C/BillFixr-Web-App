import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

import { negotiationSummary, startNegotiationForCase } from "@/lib/startNegotiation";

const adminMock = createSupabaseMock();
const auditBill = vi.fn();
const startNegotiation = vi.fn();
const isBackendConfigured = vi.fn();

vi.mock("@/lib/automation-engine", () => ({
  auditBill: (...a: unknown[]) => auditBill(...a),
  startNegotiation: (...a: unknown[]) => startNegotiation(...a),
}));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));

const CASE = { id: "case-1", bill_id: "bill-1", negotiation_id: null };

const AUDIT = {
  settlement_options: { aggressive_offer: 1200, fair_market_offer: 1500, potential_savings: 800 },
};

// A real extraction, in the AI service's shape. The engine reads other
// field names entirely, so a fixture that is not shaped like this cannot
// catch the translation going wrong.
const EXTRACTION = {
  document_type: "hospital_bill",
  patient: { name: "Ada Patient", phone: null, email: null, address: null },
  provider: { name: "Mercy General Hospital", phone: null, email: null, address: null },
  insurer: { name: null, phone: null, email: null, address: null },
  account_number: "ACC-77",
  claim_number: null,
  statement_date: "2026-07-01",
  due_date: null,
  date_of_service_start: "2026-06-18",
  date_of_service_end: null,
  total_charges: { amount: 5000, currency: "USD" },
  insurance_paid: { amount: 0, currency: "USD" },
  adjustments: { amount: 0, currency: "USD" },
  patient_responsibility: { amount: 4500, currency: "USD" },
  line_items: [
    {
      description: "ER visit",
      service_code: "99284",
      service_date: "2026-06-18",
      quantity: 1,
      charge: { amount: 500, currency: "USD" },
      patient_responsibility: { amount: 100, currency: "USD" },
      confidence: 0.8,
    },
  ],
  detected_issues: [],
  missing_fields: [],
  confidence: 0.9,
};

// What bill_extractions.result actually holds — the whole processing
// response, with the extraction nested inside processed_documents. Using
// the bare extraction here instead is what hid the unwrapping bug: the
// fixture agreed with the code and both disagreed with the table.
const STORED = {
  case_id: "case-1",
  processed_documents: [
    {
      document: { document_id: "doc-1", original_filename: "bill.pdf" },
      extraction: EXTRACTION,
      model_used: "openai/gpt-4o-mini",
      warnings: [],
    },
  ],
  analysis: null,
  draft: null,
};

function readyToStart({
  bill = { id: "bill-1", provider_email: "billing@hospital.test", provider_support_email: null } as Record<
    string,
    unknown
  > | null,
  fee = { processor_ref: "pi_1" } as { processor_ref: string | null } | null,
  stored = { result: STORED } as { result: unknown } | null,
  feePercentage = 20 as number | null,
  link = { data: [{ id: "case-1" }], error: null } as { data: unknown; error: { message: string } | null },
} = {}) {
  isBackendConfigured.mockReturnValue(true);
  adminMock.queueResult("bills", { data: bill, error: null });
  adminMock.queueResult("payment_records", { data: fee, error: null });
  adminMock.queueResult("bill_extractions", { data: stored, error: null });
  adminMock.queueResult("app_settings", {
    data: feePercentage === null ? null : { success_fee_percentage: feePercentage },
    error: null,
  });
  adminMock.queueResult("cases", link);
  auditBill.mockResolvedValue(AUDIT);
  startNegotiation.mockResolvedValue({ id: "neg-1", status: "DISPATCHED" });
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.reset();
});

describe("startNegotiationForCase", () => {
  it("audits the extracted bill, opens at the aggressive offer, and links the negotiation", async () => {
    readyToStart();

    const result = await startNegotiationForCase(adminMock.client as never, CASE);

    expect(result).toEqual({ started: true, negotiation: { id: "neg-1", status: "DISPATCHED" } });
    // The engine's field names, not the extraction's. Passed through
    // untranslated this audits as a $0 bill with no charges and reports
    // no issues, which is how the mismatch went unnoticed.
    expect(auditBill).toHaveBeenCalledWith({
      provider_name: "Mercy General Hospital",
      patient_name: "Ada Patient",
      account_number: "ACC-77",
      statement_date: "2026-07-01",
      date_of_service: "2026-06-18",
      total_billed: 5000,
      patient_due: 4500,
      is_itemized: true,
      line_items: [
        { description: "ER visit", cpt_code: "99284", date: "2026-06-18", quantity: 1, charge_amount: 500 },
      ],
    });
    expect(startNegotiation).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOffer: 1200,
        hospitalEmail: "billing@hospital.test",
        commitmentPaymentRef: "pi_1",
        caseId: "case-1",
        // 20% stored as a percentage, sent as the rate the engine expects.
        completionFeeRate: 0.2,
      }),
    );
  });

  it("reads the extraction out of the stored processing response", async () => {
    // The regression this guards: bill_extractions.result is an
    // AiCaseProcessingResponse, and the start used to cast it straight to
    // an extraction. `line_items.map` on the wrapper throws, so every
    // start failed as "we couldn't start the negotiation".
    readyToStart({ stored: { result: EXTRACTION } });

    const result = await startNegotiationForCase(adminMock.client as never, CASE);

    expect(result).toEqual({ started: false, blocked: "bill_not_read" });
    expect(auditBill).not.toHaveBeenCalled();
  });

  it("refuses a stored response whose document carries no extraction", async () => {
    readyToStart({ stored: { result: { case_id: "case-1", processed_documents: [], analysis: null, draft: null } } });

    expect(await startNegotiationForCase(adminMock.client as never, CASE)).toEqual({
      started: false,
      blocked: "bill_not_read",
    });
  });

  it("records the letter and the provider it went to, not just the negotiation id", async () => {
    readyToStart();

    await startNegotiationForCase(adminMock.client as never, CASE);

    // cases is the only table this writes to, so its builder is the last
    // one the mock handed out.
    const update = adminMock.from.mock.results.at(-1)!.value.update as ReturnType<typeof vi.fn>;
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        negotiation_id: "neg-1",
        // The engine sends the first letter as part of starting, so the
        // case has moved past scanning and a second manual send must be
        // refused.
        status: "letter_sent",
        provider_email: "billing@hospital.test",
      }),
    );
    expect(update.mock.calls[0][0].letter_sent_at).toEqual(expect.any(String));
  });

  it("does not ask the engine anything when it isn't configured", async () => {
    isBackendConfigured.mockReturnValue(false);

    expect(await startNegotiationForCase(adminMock.client as never, CASE)).toEqual({
      started: false,
      blocked: "engine_unavailable",
    });
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("refuses a second negotiation on the same case", async () => {
    // A second start would strand the first along with whatever it had
    // already sent to the provider.
    isBackendConfigured.mockReturnValue(true);

    expect(
      await startNegotiationForCase(adminMock.client as never, { ...CASE, negotiation_id: "neg-existing" }),
    ).toEqual({ started: false, blocked: "already_started" });
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("will not write to a provider without a billing email", async () => {
    readyToStart({ bill: { id: "bill-1", provider_email: null } });

    expect(await startNegotiationForCase(adminMock.client as never, CASE)).toEqual({
      started: false,
      blocked: "no_provider_email",
    });
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("will not write to a provider before the commitment fee is paid", async () => {
    readyToStart({ fee: null });

    expect(await startNegotiationForCase(adminMock.client as never, CASE)).toEqual({
      started: false,
      blocked: "commitment_fee_unpaid",
    });
    expect(startNegotiation).not.toHaveBeenCalled();
  });

  it("stops before the engine when the bill has not been read", async () => {
    readyToStart({ stored: null });

    expect(await startNegotiationForCase(adminMock.client as never, CASE)).toEqual({
      started: false,
      blocked: "bill_not_read",
    });
    expect(auditBill).not.toHaveBeenCalled();
  });

  it("lets the engine apply its own fee rate when the setting is missing", async () => {
    readyToStart({ feePercentage: null });

    await startNegotiationForCase(adminMock.client as never, CASE);

    expect(startNegotiation).toHaveBeenCalledWith(expect.objectContaining({ completionFeeRate: undefined }));
  });

  it("falls back to the case id when the paid fee has no processor ref", async () => {
    readyToStart({ fee: { processor_ref: null } });

    await startNegotiationForCase(adminMock.client as never, CASE);

    expect(startNegotiation).toHaveBeenCalledWith(expect.objectContaining({ commitmentPaymentRef: "case-1" }));
  });

  it("reports an engine refusal without linking anything", async () => {
    readyToStart();
    startNegotiation.mockRejectedValue(new Error("engine down"));

    const result = await startNegotiationForCase(adminMock.client as never, CASE);

    expect(result).toMatchObject({ started: false, failed: "engine_refused" });
    // No write at all: bills, payment_records, bill_extractions,
    // app_settings — and not cases.
    expect(adminMock.from).not.toHaveBeenCalledWith("cases");
  });

  it("surfaces the negotiation id when the link is lost, so it is not stranded silently", async () => {
    readyToStart({ link: { data: null, error: { message: "deadlock" } } });

    const result = await startNegotiationForCase(adminMock.client as never, CASE);

    expect(result).toMatchObject({ started: false, failed: "link_lost", negotiationId: "neg-1" });
  });

  it("treats losing the link race as link_lost rather than overwriting the winner", async () => {
    // The update is conditional on negotiation_id still being null, so a
    // second concurrent start matches no row.
    readyToStart({ link: { data: [], error: null } });

    const result = await startNegotiationForCase(adminMock.client as never, CASE);

    expect(result).toMatchObject({ started: false, failed: "link_lost", negotiationId: "neg-1" });
  });
});

describe("negotiationSummary", () => {
  it("counts an already-running negotiation as running", async () => {
    expect(negotiationSummary({ started: false, blocked: "already_started" })).toEqual({
      running: true,
      reason: "already_started",
    });
  });

  it("reports every other block as not running, with the reason", async () => {
    for (const blocked of ["engine_unavailable", "no_provider_email", "commitment_fee_unpaid", "bill_not_read"] as const) {
      expect(negotiationSummary({ started: false, blocked })).toEqual({ running: false, reason: blocked });
    }
  });

  it("never leaks the cause, which can carry an engine response", async () => {
    const summary = negotiationSummary({
      started: false,
      failed: "engine_refused",
      cause: new Error("ENGINE_API_KEY rejected"),
    });

    expect(summary).toEqual({ running: false, reason: "engine_refused" });
  });

  it("reports a started negotiation as running with no reason", async () => {
    expect(negotiationSummary({ started: true, negotiation: { id: "neg-1" } as never })).toEqual({
      running: true,
      reason: null,
    });
  });
});
