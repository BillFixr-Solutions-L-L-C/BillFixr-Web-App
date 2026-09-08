export type AiHealthResponse = {
  status: string;
  environment: string;
  ai_configured: boolean;
  ai_provider: string;
  ai_model: string;
  ocr_enabled: boolean;
  ocr_engine: string;
  database_configured: boolean;
  auth_enabled: boolean;
  malware_scan_enabled: boolean;
  clamav_enabled: boolean;
};

export type AiServiceConfig = {
  baseUrl: string;
  apiKey?: string;
};

// Mirrors services/ai-service/app/contracts.py — only the fields this app
// actually reads are typed out; the AI service's response may carry more.
export type AiMoneyAmount = {
  amount: number | null;
  currency: string;
};

export type AiParty = {
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
};

export type AiBillLineItem = {
  description: string | null;
  service_code: string | null;
  service_date: string | null;
  quantity: number | null;
  charge: AiMoneyAmount;
  patient_responsibility: AiMoneyAmount;
  confidence: number;
};

export type AiMedicalBillExtraction = {
  document_type: string;
  patient: AiParty;
  provider: AiParty;
  insurer: AiParty;
  account_number: string | null;
  claim_number: string | null;
  statement_date: string | null;
  due_date: string | null;
  date_of_service_start: string | null;
  date_of_service_end: string | null;
  total_charges: AiMoneyAmount;
  insurance_paid: AiMoneyAmount;
  adjustments: AiMoneyAmount;
  patient_responsibility: AiMoneyAmount;
  line_items: AiBillLineItem[];
  detected_issues: string[];
  missing_fields: string[];
  confidence: number;
};

export type AiProcessedDocument = {
  document: { document_id: string; original_filename: string };
  extraction: AiMedicalBillExtraction;
  model_used: string | null;
  warnings: string[];
};

export type AiAuditIssue = {
  category: string;
  severity: "info" | "warning" | "error";
  summary: string;
  evidence: string[];
};

export type AiSavingsOpportunity = {
  category: string;
  title: string;
  rationale: string;
  estimated_savings: AiMoneyAmount;
  confidence: number;
  evidence: string[];
};

export type AiCaseFinancialSummary = {
  total_charges: AiMoneyAmount;
  insurance_paid: AiMoneyAmount;
  adjustments: AiMoneyAmount;
  patient_responsibility: AiMoneyAmount;
  outstanding_balance: AiMoneyAmount;
  document_count_with_amounts: number;
};

export type AiRecommendedAction = {
  action_type: string;
  title: string;
  rationale: string;
  required_documents: string[];
  automation_ready: boolean;
};

export type AiCaseAnalysis = {
  case_id: string;
  document_count: number;
  document_types: string[];
  needs_human_review: boolean;
  confidence_score: number;
  summary: string;
  financial_summary: AiCaseFinancialSummary;
  issues: AiAuditIssue[];
  savings_opportunities: AiSavingsOpportunity[];
  recommended_action: AiRecommendedAction;
};

export type AiDraftCommunication = {
  subject: string;
  recipient_type: string;
  body: string;
  tone: string;
  send_channel: string;
};

export type AiCaseProcessingResponse = {
  case_id: string;
  processed_documents: AiProcessedDocument[];
  analysis: AiCaseAnalysis;
  draft: AiDraftCommunication | null;
};
