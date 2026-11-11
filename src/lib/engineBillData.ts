import type { AiCaseProcessingResponse, AiMedicalBillExtraction } from "@/types/ai";
import type {
  EngineBillData,
  EngineBillLineItem,
  EngineExtraction,
  EngineExtractionLineItem,
} from "@/types/automation-engine";

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

// --- the engine's own reading ---------------------------------------------
//
// POST /api/extract already speaks the audit's language: `provider_name`,
// `patient_due`, `line_items[].cpt_code`. So this is a normalisation, not a
// translation — there is no field to rename. What it has to do instead is
// defend against the shape being advisory: the engine asks a vision model
// for this JSON in its prompt and parses whatever comes back, so a number
// can arrive as the string "2,500.00", a missing value as the literal
// placeholder "string", and line_items as absent entirely.

/** The prompt's own placeholders, echoed back when the model found nothing.
 *  Treated as absent rather than passed on as a provider called "string". */
const PLACEHOLDERS = new Set(["string", "null", "n/a", "na", "none", "unknown", "yyyy-mm-dd"]);

function text(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return PLACEHOLDERS.has(trimmed.toLowerCase()) ? "" : trimmed;
}

/** A money or quantity field that may arrive as a number, "2,500.00",
 *  "$2,500.00", or a placeholder. Returns null for anything unreadable, so
 *  a caller can tell "nothing there" from a real zero. */
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/[$,\s]/g, "");
  if (!cleaned || !/^-?\d*\.?\d+$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapEngineLineItem(item: EngineExtractionLineItem): EngineBillLineItem {
  return {
    description: text(item.description),
    cpt_code: text(item.cpt_code),
    date: text(item.date),
    // An unreadable quantity is one unit, not zero units: a line that
    // exists was charged at least once, and 0 would make a markup check
    // divide a charge by nothing.
    quantity: num(item.quantity) ?? 1,
    charge_amount: num(item.charge_amount) ?? 0,
  };
}

export function fromEngineExtraction(extraction: EngineExtraction): EngineBillData {
  const lineItems = (extraction.line_items ?? []).filter(Boolean).map(mapEngineLineItem);

  // Same rule as the ai-service path: a line the model could not price is
  // no use to a duplicate or markup check, so the bill only counts as
  // itemized when at least one line carries a charge.
  //
  // The engine's own `is_itemized` is deliberately not trusted on its own.
  // It is the model's opinion about the document, and claiming itemized
  // while carrying no priced lines suppresses the "Summary Bill Detected"
  // finding that demands a UB-04 — the single most useful thing to ask for
  // when the charges could not be read. Both must agree.
  const hasChargedLines = lineItems.some((item) => item.charge_amount > 0);

  const totalBilled = num(extraction.total_billed);
  const patientDue = num(extraction.patient_due);

  return {
    provider_name: text(extraction.provider_name) || "Healthcare Provider",
    patient_name: text(extraction.patient_name) || "Patient",
    account_number: text(extraction.account_number) || "N/A",
    statement_date: text(extraction.statement_date),
    date_of_service: text(extraction.date_of_service),
    // Each falls back to the other: a bill stating only a balance due has
    // no total, and an itemized bill the insurer has not touched has no
    // separate patient figure.
    total_billed: totalBilled ?? patientDue ?? 0,
    patient_due: patientDue ?? totalBilled ?? 0,
    is_itemized: extraction.is_itemized === true && hasChargedLines,
    line_items: lineItems,
  };
}

/** True when this looks like an engine reading rather than an ai-service
 *  one. Keyed on `line_items` being an array at the top level, which is the
 *  structural difference — the ai-service nests everything under
 *  `processed_documents`. */
export function isEngineExtraction(value: unknown): value is EngineExtraction {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if ("processed_documents" in candidate) return false;
  return (
    Array.isArray(candidate.line_items) ||
    typeof candidate.provider_name === "string" ||
    typeof candidate.patient_due === "number"
  );
}

/**
 * The bill data to audit, from whichever reading a bill has.
 *
 * The engine's reading wins when there is one: it carries CPT and revenue
 * codes per line item, which the ai-service extraction never did and which
 * several audit rules are built on. A bill read before 2026-11-10 has only
 * the ai-service reading, and it still negotiates from that rather than
 * being told it was never read.
 *
 * Null rather than an empty bill when neither is usable: a $0 bill with no
 * charges audits as faultless, and a letter arguing nothing is worse than
 * no letter.
 */
export function storedBillData(row: {
  engine_result?: unknown;
  result?: unknown;
} | null | undefined): EngineBillData | null {
  if (isEngineExtraction(row?.engine_result)) {
    return fromEngineExtraction(row.engine_result as EngineExtraction);
  }
  const aiExtraction = storedExtraction(row?.result);
  return aiExtraction ? toEngineBillData(aiExtraction) : null;
}
