import { describe, expect, it } from "vitest";

import {
  fromEngineExtraction,
  isEngineExtraction,
  storedBillData,
  toEngineBillData,
} from "@/lib/engineBillData";
import type { AiMedicalBillExtraction } from "@/types/ai";

const money = (amount: number | null) => ({ amount, currency: "USD" });
const party = (name: string | null) => ({ name, phone: null, email: null, address: null });

function extraction(overrides: Partial<AiMedicalBillExtraction> = {}): AiMedicalBillExtraction {
  return {
    document_type: "hospital_bill",
    patient: party("Ada Patient"),
    provider: party("Mercy General Hospital"),
    insurer: party(null),
    account_number: "ACC-77",
    claim_number: null,
    statement_date: "2026-07-01",
    due_date: null,
    date_of_service_start: "2026-06-18",
    date_of_service_end: null,
    total_charges: money(2461.38),
    insurance_paid: money(0),
    adjustments: money(0),
    patient_responsibility: money(2461.38),
    line_items: [
      {
        description: "Emergency department visit, level 4",
        service_code: "99284",
        service_date: "2026-06-18",
        quantity: 1,
        charge: money(1850),
        patient_responsibility: money(1850),
        confidence: 0.9,
      },
    ],
    detected_issues: [],
    missing_fields: [],
    confidence: 0.9,
    ...overrides,
  };
}

describe("toEngineBillData", () => {
  it("renames every field the audit rules read", () => {
    const result = toEngineBillData(extraction());

    expect(result).toEqual({
      provider_name: "Mercy General Hospital",
      patient_name: "Ada Patient",
      account_number: "ACC-77",
      statement_date: "2026-07-01",
      date_of_service: "2026-06-18",
      total_billed: 2461.38,
      patient_due: 2461.38,
      is_itemized: true,
      line_items: [
        {
          description: "Emergency department visit, level 4",
          cpt_code: "99284",
          date: "2026-06-18",
          quantity: 1,
          charge_amount: 1850,
        },
      ],
    });
  });

  it("does not leave the engine reading a zero bill", () => {
    // The failure this exists to prevent: the engine defaults every field
    // it cannot find, so wrong names produce a $0 bill and a clean audit.
    const result = toEngineBillData(extraction());

    expect(result.total_billed).toBeGreaterThan(0);
    expect(result.line_items[0].charge_amount).toBeGreaterThan(0);
    expect(result.line_items[0].cpt_code).toBe("99284");
  });

  it("falls back between the two totals, in both directions", () => {
    const balanceOnly = toEngineBillData(
      extraction({ total_charges: money(null), patient_responsibility: money(82.3) }),
    );
    expect(balanceOnly.total_billed).toBe(82.3);
    expect(balanceOnly.patient_due).toBe(82.3);

    const chargesOnly = toEngineBillData(
      extraction({ total_charges: money(900), patient_responsibility: money(null) }),
    );
    expect(chargesOnly.total_billed).toBe(900);
    expect(chargesOnly.patient_due).toBe(900);
  });

  it("is not itemized when no line carries a charge", () => {
    // A summary statement, or lines the extraction could not price.
    // Claiming itemized here would suppress the engine's "request an
    // itemized UB-04" finding, which is the one thing it can still say.
    const noLines = toEngineBillData(extraction({ line_items: [] }));
    expect(noLines.is_itemized).toBe(false);

    const unpriced = toEngineBillData({
      ...extraction(),
      line_items: [
        {
          description: "Hospital services",
          service_code: null,
          service_date: null,
          quantity: null,
          charge: money(null),
          patient_responsibility: money(null),
          confidence: 0,
        },
      ],
    });
    expect(unpriced.is_itemized).toBe(false);
    expect(unpriced.line_items[0].charge_amount).toBe(0);
    expect(unpriced.line_items[0].quantity).toBe(1);
  });

  it("uses the engine's own fallbacks for missing names", () => {
    const anonymous = toEngineBillData(
      extraction({ provider: party(null), patient: party(null), account_number: null }),
    );

    expect(anonymous.provider_name).toBe("Healthcare Provider");
    expect(anonymous.patient_name).toBe("Patient");
    expect(anonymous.account_number).toBe("N/A");
  });
});

// --- the engine's own reading ---------------------------------------------
//
// These cover fromEngineExtraction/storedBillData, added 2026-11-10 when the
// information step moved from the ai-service to the engine's /api/extract.
// The engine already speaks the audit's language, so the risk here is not
// renaming fields -- it is that the shape is advisory. The engine asks a
// vision model for this JSON in a prompt and parses whatever comes back.

describe("fromEngineExtraction", () => {
  const FULL = {
    provider_name: "Riverside General",
    patient_name: "Jordan Patient",
    account_number: "ACC-77",
    statement_date: "2026-07-20",
    date_of_service: "2026-07-14",
    is_itemized: true,
    total_billed: 4200,
    insurance_paid: 1000,
    patient_due: 3200,
    line_items: [
      { line_id: "L1", date: "2026-07-14", cpt_code: "99285", description: "ER Level 5", quantity: 1, charge_amount: 4200 },
    ],
  };

  it("passes the engine's own field names straight through", () => {
    expect(fromEngineExtraction(FULL)).toEqual({
      provider_name: "Riverside General",
      patient_name: "Jordan Patient",
      account_number: "ACC-77",
      statement_date: "2026-07-20",
      date_of_service: "2026-07-14",
      total_billed: 4200,
      patient_due: 3200,
      is_itemized: true,
      line_items: [
        { description: "ER Level 5", cpt_code: "99285", date: "2026-07-14", quantity: 1, charge_amount: 4200 },
      ],
    });
  });

  it("reads money the model wrote as a formatted string", () => {
    const data = fromEngineExtraction({
      ...FULL,
      total_billed: "$4,200.00" as unknown as number,
      patient_due: "3,200" as unknown as number,
      line_items: [{ description: "ER", charge_amount: "4,200.00" as unknown as number, quantity: "2" as unknown as number }],
    });
    expect(data.total_billed).toBe(4200);
    expect(data.patient_due).toBe(3200);
    expect(data.line_items[0].charge_amount).toBe(4200);
    expect(data.line_items[0].quantity).toBe(2);
  });

  it("treats the prompt's placeholders as nothing found", () => {
    const data = fromEngineExtraction({
      ...FULL,
      provider_name: "string",
      account_number: "N/A",
      statement_date: "YYYY-MM-DD",
    });
    // The engine defaults these itself, so a literal "string" would reach a
    // dispute letter as the hospital's name.
    expect(data.provider_name).toBe("Healthcare Provider");
    expect(data.account_number).toBe("N/A");
    expect(data.statement_date).toBe("");
  });

  it("falls each total back to the other", () => {
    expect(fromEngineExtraction({ ...FULL, total_billed: null }).total_billed).toBe(3200);
    expect(fromEngineExtraction({ ...FULL, patient_due: null }).patient_due).toBe(4200);
  });

  it("is not itemized when no line carries a charge, whatever the model claims", () => {
    // is_itemized true with no priced lines suppresses "Summary Bill
    // Detected", which is the finding that demands an itemized UB-04 --
    // the most useful thing to ask for when the charges could not be read.
    const data = fromEngineExtraction({
      ...FULL,
      is_itemized: true,
      line_items: [{ description: "Lab", charge_amount: null }],
    });
    expect(data.is_itemized).toBe(false);
    expect(data.line_items).toHaveLength(1);
  });

  it("is not itemized when the model says it isn't, even with priced lines", () => {
    expect(fromEngineExtraction({ ...FULL, is_itemized: false }).is_itemized).toBe(false);
  });

  it("counts an unreadable quantity as one unit, not zero", () => {
    // Zero would make a markup check divide a charge by nothing.
    const data = fromEngineExtraction({ ...FULL, line_items: [{ description: "X", charge_amount: 10 }] });
    expect(data.line_items[0].quantity).toBe(1);
  });

  it("survives line_items being absent entirely", () => {
    const data = fromEngineExtraction({ provider_name: "Clinic" });
    expect(data.line_items).toEqual([]);
    expect(data.is_itemized).toBe(false);
    expect(data.total_billed).toBe(0);
  });
});

describe("storedBillData", () => {
  const ENGINE = { provider_name: "Engine Read", patient_due: 500, line_items: [] };
  const AI = {
    processed_documents: [
      {
        extraction: {
          provider: { name: "AI Read" },
          patient: {},
          account_number: "A1",
          total_charges: { amount: 900 },
          patient_responsibility: { amount: 900 },
          line_items: [],
        },
      },
    ],
  };

  it("prefers the engine's reading when there is one", () => {
    expect(storedBillData({ engine_result: ENGINE, result: AI })?.provider_name).toBe("Engine Read");
  });

  it("falls back to the ai-service reading on a bill read before the switch", () => {
    expect(storedBillData({ engine_result: null, result: AI })?.provider_name).toBe("AI Read");
  });

  it("is null when neither reading is usable, rather than a $0 bill", () => {
    // A $0 bill with no charges audits as faultless, and a letter arguing
    // nothing is worse than no letter.
    expect(storedBillData({ engine_result: null, result: null })).toBeNull();
    expect(storedBillData(null)).toBeNull();
    expect(storedBillData({})).toBeNull();
  });

  it("does not mistake an ai-service response for an engine one", () => {
    expect(isEngineExtraction(AI)).toBe(false);
  });
});
