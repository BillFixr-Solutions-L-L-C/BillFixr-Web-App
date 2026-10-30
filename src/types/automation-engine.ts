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

// A finding from the audit. `confidence` is "high" for structural, fully sourced rules and
// "needs_review" for keyword rules, estimates, or unverified benchmark rates.
// A hospital's billing contacts. Every field except the notes can be null: the engine never guesses, and
// most hospitals publish no billing email. The first three fields match AiProviderContact in ai-service.ts.
export type AutomationProviderContact = {
  billing_email: string | null;
  support_email: string | null;
  phone: string | null;
  provider_name: string | null;
  billing_url: string | null;
  sources: string[];
  verification_status: "verified" | "listed" | "unverified";
  notes: string;
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
  hospitalEmail: string;
  supportEmail?: string;
  // The web app charges the client and reports it here. The engine does not take payments.
  commitmentPaymentRef: string;
  // The completion fee rate for this case, for example from the admin pricing settings.
  completionFeeRate?: number;
};
