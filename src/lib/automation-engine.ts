import type {
  AutomationAuditResult,
  AutomationEngineConfig,
  AutomationEngineFees,
  AutomationEngineHealth,
  AutomationNegotiation,
  StartNegotiationInput,
} from "@/types/automation-engine";

// Client for services/automation-engine: audit rules, the negotiation autopilot, the revised bill,
// and the fee calculation. Call it from the server only. The API key must never reach the browser.
// Authorise the signed-in user before every call. The engine trusts whoever holds the API key.

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAutomationEngineConfig(): AutomationEngineConfig | null {
  const baseUrl = process.env.AUTOMATION_ENGINE_BASE_URL;

  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    apiKey: process.env.AUTOMATION_ENGINE_API_KEY,
  };
}

export async function automationEngineFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = getAutomationEngineConfig();

  if (!config) {
    throw new Error("Automation engine is not configured. Set AUTOMATION_ENGINE_BASE_URL.");
  }

  const headers = new Headers(init?.headers);
  if (config.apiKey) {
    headers.set("X-API-Key", config.apiKey);
  }

  return fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function readJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Automation engine ${action} failed with status ${response.status}: ${detail}`);
  }

  return (await response.json()) as T;
}

function jsonRequest(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

export async function getEngineHealth(): Promise<AutomationEngineHealth> {
  return readJson(await automationEngineFetch("/api/health"), "health check");
}

// The engine's default fees. The completion rate can be overridden per case in startNegotiation.
export async function getEngineFees(): Promise<AutomationEngineFees> {
  return readJson(await automationEngineFetch("/api/fees"), "fee lookup");
}

// POST /api/audit — runs the audit rules over extracted bill data. Every finding carries a source,
// a confidence level, and a citation from the engine's approved list.
export async function auditBill(
  billData: Record<string, unknown>,
  userContext?: { household_income: number; household_size: number },
): Promise<AutomationAuditResult> {
  const response = await automationEngineFetch(
    "/api/audit",
    jsonRequest("POST", { bill_data: billData, user_context: userContext ?? null }),
  );
  return readJson(response, "audit");
}

// POST /api/negotiations/start — call this only after the commitment fee has been paid. The engine
// builds the first dispute letter itself and sends it to the hospital. Autopilot runs from there.
export async function startNegotiation(input: StartNegotiationInput): Promise<AutomationNegotiation> {
  const response = await automationEngineFetch(
    "/api/negotiations/start",
    jsonRequest("POST", {
      audit_result: input.auditResult,
      initial_offer: input.initialOffer,
      hospital_email: input.hospitalEmail,
      support_email: input.supportEmail ?? "",
      commitment_paid: true,
      commitment_payment_ref: input.commitmentPaymentRef,
      completion_fee_rate: input.completionFeeRate,
    }),
  );
  return readJson(response, "start negotiation");
}

// Poll this to follow a case. Status AWAITING_COMPLETION_FEE means the client should be asked to pay
// `completion_fee`. SYSTEM messages are notices for the client.
export async function getNegotiation(negotiationId: string): Promise<AutomationNegotiation> {
  return readJson(await automationEngineFetch(`/api/negotiations/${negotiationId}`), "negotiation lookup");
}

// Accepts the hospital's offer on the client's behalf and asks the hospital for a revised bill.
// Autopilot does this on its own; call it to settle a case manually.
export async function acceptOffer(negotiationId: string, acceptedAmount?: number): Promise<AutomationNegotiation> {
  const response = await automationEngineFetch(
    `/api/negotiations/${negotiationId}/accept`,
    jsonRequest("POST", { accepted_amount: acceptedAmount ?? null }),
  );
  const data = await readJson<{ negotiation: AutomationNegotiation }>(response, "accept offer");
  return data.negotiation;
}

// Hands the engine a revised bill that arrived some other way than the engine's own inbox, for example
// uploaded by support. The engine reads the PDF and the text, then checks the agreed amount.
export async function uploadRevisedBill(
  negotiationId: string,
  bill: { filename: string; bytes: Blob; emailText?: string },
): Promise<AutomationNegotiation> {
  const body = new FormData();
  body.append("reply_type", "revised_bill");
  body.append("reply_text", bill.emailText ?? "");
  body.append("file", bill.bytes, bill.filename);

  const response = await automationEngineFetch(`/api/negotiations/${negotiationId}/reply/upload`, {
    method: "POST",
    body,
  });
  const data = await readJson<{ negotiation: AutomationNegotiation }>(response, "revised bill upload");
  return data.negotiation;
}

// Call this after the client's completion fee payment has succeeded (for example from the Stripe
// webhook). It unlocks the revised bill. `paymentReference` is stored with the case.
export async function confirmCompletionPayment(
  negotiationId: string,
  paymentReference: string,
): Promise<AutomationNegotiation> {
  const response = await automationEngineFetch(
    `/api/negotiations/${negotiationId}/pay/completion`,
    jsonRequest("POST", { payment_reference: paymentReference }),
  );
  const data = await readJson<{ negotiation: AutomationNegotiation }>(response, "completion payment");
  return data.negotiation;
}

// Returns the engine's response as is so a route handler can stream the PDF to the client. The engine
// answers 402 until the completion fee is paid, and 404 when the hospital sent no PDF.
export async function fetchRevisedBillPdf(negotiationId: string): Promise<Response> {
  return automationEngineFetch(`/api/negotiations/${negotiationId}/revised-bill/pdf`);
}
