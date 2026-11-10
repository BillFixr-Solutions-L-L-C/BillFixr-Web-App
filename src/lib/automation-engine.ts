import type {
  AutomationAuditResult,
  AutomationEngineConfig,
  AutomationEngineFees,
  AutomationEngineHealth,
  AutomationNegotiation,
  AutomationProviderContact,
  EngineBillData,
  EngineExtraction,
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

// Reading a bill is a vision-model call behind a free-tier cold start, so
// it needs minutes. Every other engine call is a lookup or a database
// write and should not be allowed to hang for that long.
//
// This exists because the same mistake was already made and fixed once on
// the AI service client: without a timeout we own, the request hangs until
// the platform kills the whole function, which produces no error here, no
// log line naming the stage, and a bill stuck mid-read with nothing to say
// why. See src/lib/ai-service.ts.
const DEFAULT_TIMEOUT_MS = Number(process.env.AUTOMATION_ENGINE_TIMEOUT_MS ?? 60_000);
const EXTRACT_TIMEOUT_MS = Number(process.env.AUTOMATION_ENGINE_EXTRACT_TIMEOUT_MS ?? 240_000);

/** The engine did not answer in time. Distinct so a caller can say "try
 *  again", which is right for a timeout and wrong for a refusal. */
export class AutomationEngineTimeoutError extends Error {
  constructor(
    readonly path: string,
    readonly timeoutMs: number,
  ) {
    // No hostname in the message: this text can reach a client, and a
    // previous audit finding was about leaking connection details.
    super(`Automation engine did not respond within ${timeoutMs}ms.`);
    this.name = "AutomationEngineTimeoutError";
  }
}

export async function automationEngineFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const config = getAutomationEngineConfig();

  if (!config) {
    throw new Error("Automation engine is not configured. Set AUTOMATION_ENGINE_BASE_URL.");
  }

  const headers = new Headers(init?.headers);
  if (config.apiKey) {
    headers.set("X-API-Key", config.apiKey);
  }

  // timeoutMs is ours, not RequestInit's — it must not reach fetch.
  const { timeoutMs, signal, ...rest } = init ?? {};
  const budget = timeoutMs ?? DEFAULT_TIMEOUT_MS;

  try {
    return await fetch(`${config.baseUrl}${path}`, {
      ...rest,
      headers,
      cache: "no-store",
      // A caller that brought its own signal keeps control.
      signal: signal ?? AbortSignal.timeout(budget),
    });
  } catch (err) {
    // Both names appear in the wild: AbortSignal.timeout gives TimeoutError,
    // while some runtimes surface the abort as AbortError.
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      throw new AutomationEngineTimeoutError(path, budget);
    }
    throw err;
  }
}

/** Thrown when the engine answers a call with a non-2xx status. Carries the
 *  status so a caller can tell a refusal it should pass on (409: nothing to
 *  approve) from the engine simply being broken or unreachable. */
export class AutomationEngineError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
    this.name = "AutomationEngineError";
  }
}

async function readJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new AutomationEngineError(
      `Automation engine ${action} failed with status ${response.status}: ${detail}`,
      response.status,
      detail,
    );
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

// POST /api/extract — the engine reads the bill itself.
//
// This replaced the ai-service for reading an uploaded bill on 2026-11-10.
// The ai-service ran the page through tesseract and sent only the resulting
// text to a model, so a phone photo arrived as garbled characters or, in one
// production case, as nothing at all. The engine has always sent the page
// images straight to a vision model (gemini-2.5-flash, qwen2.5-vl as
// fallback) and additionally returns CPT and revenue codes per line item,
// which the audit rules need and the ai-service extraction never carried.
//
// `files` is the field name, plural, and the engine also accepts a single
// `file`. One call per document is what this app does; the engine would
// merge several into one reading.
//
// Known limits of the engine's own file handling, worth knowing before
// blaming a blank answer on the model:
//  - a PDF is read by pulling *embedded* images out of its first three
//    pages, one per page. A PDF this app built from photos (see
//    prepareBillFile in src/lib/billUpload.ts) is exactly that shape.
//  - a PDF with a text layer and no embedded images falls back to its text.
//  - a vector-drawn PDF with neither is refused outright, as a 500.
export async function extractBill(file: {
  filename: string;
  bytes: Blob;
}): Promise<EngineExtraction> {
  const body = new FormData();
  body.append("files", file.bytes, file.filename);

  const response = await automationEngineFetch("/api/extract", {
    method: "POST",
    body,
    timeoutMs: EXTRACT_TIMEOUT_MS,
  });

  return readJson(response, "bill extraction");
}

export async function getEngineHealth(): Promise<AutomationEngineHealth> {
  return readJson(await automationEngineFetch("/api/health"), "health check");
}

// The engine's default fees. The completion rate can be overridden per case in startNegotiation.
export async function getEngineFees(): Promise<AutomationEngineFees> {
  return readJson(await automationEngineFetch("/api/fees"), "fee lookup");
}

// POST /api/providers/contact — looks the hospital up in the engine's sourced directory. Same name and
// call shape as findProviderContact in ai-service.ts, and the result carries the same three fields plus
// sources and notes, so it can replace that stub. Most hospitals publish no billing email, so
// billing_email is often null. Show `notes` to the customer when it is.
export async function findProviderContact(provider: {
  name: string;
  address?: string | null;
}): Promise<AutomationProviderContact> {
  const response = await automationEngineFetch(
    "/api/providers/contact",
    jsonRequest("POST", { provider_name: provider.name, address: provider.address ?? null }),
  );
  return readJson(response, "provider contact lookup");
}

// POST /api/audit — runs the audit rules over extracted bill data. Every finding carries a source,
// a confidence level, and a citation from the engine's approved list.
export async function auditBill(
  // Typed as the engine's own shape, not Record<string, unknown>: every
  // field is read with a default on the engine side, so a payload with
  // the wrong field names audits as a $0 bill and reports no issues
  // rather than failing. Use toEngineBillData() to build it.
  billData: EngineBillData,
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
      external_ref: input.caseId,
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

// Releases a negotiation the engine parked for review, settling at the figure the hospital actually
// agreed to. Takes no amount on purpose: the engine stores what was agreed when it held the case, and
// that is the only number it may accept. Use acceptOffer to settle at a figure of your own choosing.
//
// The engine answers 409 when nothing is held, or when a hold carries no agreed amount.
// POST /api/negotiations/{id}/no-response/close — ends a case the provider
// never answered.
//
// Until this was wired, a hospital that simply never replied left the case
// at `awaiting_response` forever: the three 72-hour follow-ups went out, the
// engine stopped, and nothing could finish it. For a provider that ignores
// us — likely a large share of real cases — there was no ending at all.
//
// The engine itself applies no guard here; it will close whatever it is
// given. The caller is responsible for checking the follow-ups are actually
// exhausted and the provider really has not responded. See the route.
export async function closeForNoResponse(
  negotiationId: string,
  reason?: string,
): Promise<AutomationNegotiation> {
  const response = await automationEngineFetch(
    `/api/negotiations/${negotiationId}/no-response/close`,
    jsonRequest("POST", { reason: reason ?? null }),
  );
  const data = await readJson<{ negotiation: AutomationNegotiation }>(response, "close for no response");
  return data.negotiation;
}

export async function approveHeldSettlement(negotiationId: string): Promise<AutomationNegotiation> {
  const response = await automationEngineFetch(
    `/api/negotiations/${negotiationId}/review/approve`,
    jsonRequest("POST"),
  );
  const data = await readJson<{ negotiation: AutomationNegotiation }>(response, "approve held settlement");
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
