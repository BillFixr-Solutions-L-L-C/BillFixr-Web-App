// Mirrors services/automation-engine (server.py and database.py). Only the fields the web app is
// expected to read are typed out; the engine's responses may carry more.

export type AutomationEngineConfig = {
  baseUrl: string;
  apiKey?: string;
};

export type AutomationEngineHealth = {
  status: string;
  openrouter_configured: boolean;
};

export type AutomationEngineFees = {
  commitment_fee: number;
  completion_fee_rate: number;
};

// What POST /api/extract returns: the engine's own reading of the bill,
// from services/automation-engine/engine/vision_extractor.py.
//
// Every field is optional because none of them is guaranteed. The engine
// asks the vision model for this shape in the *prompt* and then parses
// whatever JSON comes back (including repairing a truncated response) —
// there is no enforced structured-output contract, so a field can be
// absent, null, or the empty string the prompt's "string" placeholder
// invites. Treat all three as "not found".
export type EngineExtractionLineItem = {
  line_id?: string | null;
  date?: string | null;
  cpt_code?: string | null;
  revenue_code?: string | null;
  description?: string | null;
  quantity?: number | null;
  charge_amount?: number | null;
  category?: string | null;
};

export type EngineExtraction = {
  id?: string | null;
  provider_name?: string | null;
  provider_address?: string | null;
  provider_phone?: string | null;
  provider_email?: string | null;
  patient_name?: string | null;
  patient_address?: string | null;
  account_number?: string | null;
  statement_date?: string | null;
  date_of_service?: string | null;
  is_itemized?: boolean | null;
  total_billed?: number | null;
  insurance_paid?: number | null;
  patient_due?: number | null;
  notes?: string | null;
  line_items?: EngineExtractionLineItem[] | null;
};

// What POST /api/audit reads out of `bill_data`. These names are the
// engine's, not the AI service's — see src/lib/engineBillData.ts for the
// translation and why it has to exist. Every field here is read with a
// default on the engine side, so a wrong name is not an error, it is a
// zero.
export type EngineBillLineItem = {
  description: string;
  cpt_code: string;
  date: string;
  quantity: number;
  charge_amount: number;
};

export type EngineBillData = {
  provider_name: string;
  patient_name: string;
  account_number: string;
  statement_date: string;
  date_of_service: string;
  total_billed: number;
  patient_due: number;
  // False makes the engine raise "Summary Bill Detected" and demand an
  // itemized UB-04, which is the right outcome for a bill whose line
  // charges could not be read.
  is_itemized: boolean;
  line_items: EngineBillLineItem[];
};

// A finding from the audit. `confidence` is "high" for structural, fully sourced rules and
// "needs_review" for keyword rules, estimates, or unverified benchmark rates.
// A hospital's billing contacts. Every field except the notes can be null: the engine never guesses, and
// most hospitals publish no billing email. The first three fields match AiProviderContact in ai-service.ts.
export type AutomationProviderCandidate = {
  npi: string;
  name: string;
  legal_name: string | null;
  facility_type: string | null;
  mailing_address: string | null;
  phone: string | null;
  fax: string | null;
  city: string | null;
  state: string | null;
  score: number;
  source_url: string | null;
};

export type AutomationProviderContact = {
  billing_email: string | null;
  support_email: string | null;
  phone: string | null;
  provider_name: string | null;
  billing_url: string | null;
  sources: string[];
  verification_status: "verified" | "listed" | "unverified";
  notes: string;
  // From the federal NPI registry, which the engine falls back to for any
  // US provider that is not in its curated directory. The registry has no
  // email field, so these are a postal address and a phone number — enough
  // to post a letter or ring the billing line, never enough to send an
  // email.
  mailing_address: string | null;
  npi: string | null;
  facility_type: string | null;
  fax: string | null;
  // The page a searched-for email was read from. An email that is not in
  // the curated directory was found on the web, and only accepted because
  // it appears on a page belonging to the same domain — this says which
  // page, so the customer can see who published the address.
  email_source_url: string | null;
  /** False when the address was found but a check on it did not pass. */
  email_confirmed: boolean;
  email_unconfirmed_reason: string | null;
  // Other facilities that matched the same name. One hospital registers
  // several NPIs — the hospital, its lab, its clinic — so the customer
  // confirms which one rather than having one chosen for them.
  candidates: AutomationProviderCandidate[];
};

export type AutomationFinding = {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  confidence: "high" | "needs_review";
  title: string;
  description: string;
  disputed_amount: number;
  recommendation: string;
  statute: string;
  source?: string;
  line_id?: string;
  cpt_code?: string;
};

export type AutomationAuditResult = {
  provider_name: string;
  patient_name: string;
  account_number: string;
  total_billed: number;
  patient_due: number;
  audit_score: number;
  risk_level: string;
  issues_count: number;
  needs_review_count: number;
  flagged_amount: number;
  settlement_options: {
    aggressive_offer: number;
    fair_market_offer: number;
    prompt_pay_discount_offer: number;
    potential_savings: number;
    savings_percentage: number;
  };
  issues: AutomationFinding[];
};

export type AutomationNegotiationStatus =
  | "DISPATCHED"
  | "IN_REVIEW"
  | "REPLY_RECEIVED"
  | "COUNTER_OFFER_SENT"
  | "COUNTER_OFFER_RECEIVED"
  | "DISPUTE_ESCALATION"
  | "PROVIDER_NO_ERROR"
  | "FINANCIAL_ASSISTANCE_REQUIRED"
  | "ITEMIZED_BILL_RECEIVED"
  | "HIPAA_AUTH_PENDING"
  | "HOSPITAL_ACCEPTED"
  | "HELD_FOR_REVIEW"
  | "SETTLEMENT_AGREED"
  | "AWAITING_COMPLETION_FEE"
  | "COMPLETED"
  | "CLOSED_NO_RESPONSE";

// OUTBOUND and INBOUND are emails on the shared thread. SYSTEM is a notice for the client and
// never leaves the app, so it maps onto the web app's notifications.
export type AutomationMessage = {
  id: string;
  direction: "OUTBOUND" | "INBOUND" | "SYSTEM";
  sender: string;
  recipient: string;
  subject: string;
  content_markdown: string;
  status: string;
  created_at: string;
  analysis?: Record<string, unknown>;
};

export type AutomationRevisedBillCheck = {
  settled_amount: number;
  settled_amount_found: boolean;
  zero_balance_found: boolean;
  passed: boolean;
};

export type AutomationNegotiation = {
  id: string;
  tracking_code: string;
  provider_name: string;
  patient_name: string;
  account_number: string;
  total_billed: number;
  current_offer: number;
  status: AutomationNegotiationStatus;
  hospital_email: string | null;
  support_email: string | null;
  auto_pilot_enabled: number;
  commitment_paid: boolean;
  settled_amount: number | null;
  completion_fee: number | null;
  completion_paid: boolean;
  /** The figure autopilot was about to accept when the review hold stopped
   *  it. Null unless the status is HELD_FOR_REVIEW. Without it a held case
   *  has no record of what the provider agreed to, which is how one went
   *  un-finishable on 2026-11-06. */
  pending_settlement_amount: number | null;
  held_for_review_at: string | null;
  /** The findings below `high` confidence that are holding the case. */
  held_for_review_reason: string | null;
  revised_bill_available: boolean;
  revised_bill_has_pdf: boolean;
  revised_bill_check?: AutomationRevisedBillCheck;
  messages: AutomationMessage[];
  created_at: string;
  updated_at: string;
};

export type StartNegotiationInput = {
  auditResult: AutomationAuditResult;
  initialOffer: number;
  // This case's id, tagged onto every letter the engine sends through
  // Resend so its webhook can attribute delivery events back to the case.
  // Without it a letter is sent untracked.
  caseId: string;
  hospitalEmail: string;
  supportEmail?: string;
  // The web app charges the client and reports it here. The engine does not take payments.
  commitmentPaymentRef: string;
  // The completion fee rate for this case, for example from the admin pricing settings.
  completionFeeRate?: number;
};
