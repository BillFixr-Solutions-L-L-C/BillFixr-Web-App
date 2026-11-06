import type { AiCaseProcessingResponse, AiMedicalBillExtraction } from "@/types/ai";
import type { EngineBillData, EngineBillLineItem } from "@/types/automation-engine";

// The AI service and the engine describe the same bill with different
// field names, and neither one is wrong — they were built against
// separate contracts. `services/ai-service/app/contracts.py` nests money
// as `{amount, currency}` and names the code `service_code`;
// `services/automation-engine/engine/audit_engine.py` reads flat floats
// and `cpt_code`. Nothing translated between them.
//
// Handing the extraction over untranslated does not fail, which is why
// it survived: `audit_bill` reads every field it wants with a default, so
// a mismatched payload audits as a $0 bill with no line charges. On
// 2026-11-04 the same bill scored 2 issues and $1,829.38 of savings in
// the engine's own shape, and 0 issues and $0.00 through the extraction
// shape — both answering HTTP 200. A case would simply report that
// nothing was wrong with the bill.
//
// `is_itemized` is deliberate rather than derived from the list being
// non-empty: it is what makes the engine raise "Summary Bill Detected"
// and demand an itemized UB-04, so a bill whose charges we could not
// read must not claim to be itemized.

function money(value: { amount: number | null } | null | undefined): number | null {
  return value?.amount ?? null;
}

function mapLineItem(item: AiMedicalBillExtraction["line_items"][number]): EngineBillLineItem {
  return {
    description: item.description ?? "",
    cpt_code: item.service_code ?? "",
    date: item.service_date ?? "",
    quantity: item.quantity ?? 1,
    charge_amount: money(item.charge) ?? 0,
  };
}

export function toEngineBillData(extraction: AiMedicalBillExtraction): EngineBillData {
  const lineItems = extraction.line_items.map(mapLineItem);

  // Charges are what the audit rules work from. A line item the
  // extraction could not price is no use to a duplicate or markup check,
  // so the bill only counts as itemized when at least one line carries
  // one.
  const hasChargedLines = lineItems.some((item) => item.charge_amount > 0);

  const totalCharges = money(extraction.total_charges);
  const patientResponsibility = money(extraction.patient_responsibility);

  return {
    provider_name: extraction.provider.name ?? "Healthcare Provider",
    patient_name: extraction.patient.name ?? "Patient",
    account_number: extraction.account_number ?? "N/A",
    statement_date: extraction.statement_date ?? "",
    date_of_service: extraction.date_of_service_start ?? "",
    // The engine falls back to total_billed when patient_due is absent,
    // and on a bill that states only a balance due the patient's figure
    // is the one that exists. Each falls back to the other.
    total_billed: totalCharges ?? patientResponsibility ?? 0,
    patient_due: patientResponsibility ?? totalCharges ?? 0,
    is_itemized: hasChargedLines,
    line_items: lineItems,
  };
}

// What a bill_extractions row actually holds: the whole
// AiCaseProcessingResponse, not the extraction inside it. Both writers
// (bills/[id]/extract and dev/process-with-ai) store the full response
// and unwrap it again on read. The negotiation start did not — it cast
// the row straight to AiMedicalBillExtraction, and `line_items.map` on
// the wrapper throws, so every start failed as "we couldn't start the
// negotiation" without ever saying what was wrong.
//
// Null rather than an empty bill when there is no readable extraction: a
// $0 bill with no charges audits as faultless, and a letter arguing
// nothing is worse than no letter.
export function storedExtraction(result: unknown): AiMedicalBillExtraction | null {
  const response = result as AiCaseProcessingResponse | null | undefined;
  const extraction = response?.processed_documents?.[0]?.extraction;
  return extraction && Array.isArray(extraction.line_items) ? extraction : null;
}
