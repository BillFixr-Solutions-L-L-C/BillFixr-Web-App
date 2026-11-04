import { describe, expect, it } from "vitest";

import { toEngineBillData } from "@/lib/engineBillData";
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
