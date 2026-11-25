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
// Four minutes, inside the 300s the route is allowed. Our timeout has to
// fire before the platform's so the customer gets "this took too long,
// try again" rather than a dead request.
const EXTRACT_TIMEOUT_MS = Number(process.env.AUTOMATION_ENGINE_EXTRACT_TIMEOUT_MS ?? 240_000);

// How long to wait for the engine to say it is awake.
//
// This was 8s, chosen while I believed the whole request budget was 60s
// and that a cold start could not possibly fit inside it. The budget is
// actually 300s (Vercel Hobby's maximum AND its default), so there is
// room to simply wait -- and 8s was far too short regardless.
//
// Measured against the live engine on 2026-11-25, cold after a night
// idle: 29.5s to answer /api/health on the first call, then 1.6s, 9.8s
// and 13.0s while warm. So 8s lost the race even when the engine was
// already up, and a customer whose reader was merely asleep got a blank
// form -- the 2026-11-25 report.
//
// 45s covers the measured cold start with margin and still leaves the
// 240s extract budget inside the 300s ceiling. It costs nothing when the
// engine is warm, because a warm engine answers in about two seconds.
export const WAKE_TIMEOUT_MS = Number(process.env.AUTOMATION_ENGINE_WAKE_TIMEOUT_MS ?? 45_000);

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

/**
 * Whether the engine is awake, and a nudge if it is not.
 *
 * Returns false rather than throwing: a cold engine is not an error, it
 * is a thing that takes another twenty seconds. The request that got this
 * answer should say so and let the caller come back, because waiting here
 * spends the budget the actual work needs.
 */
export async function wakeAutomationEngine(): Promise<boolean> {
  try {
    const response = await automationEngineFetch("/api/health", { timeoutMs: WAKE_TIMEOUT_MS });
    // The status has to be read. automationEngineFetch hands back
    // whatever came, throwing only on a timeout or a dead socket, so the
    // original `return true` here counted a 503 as "awake" -- and the
    // host in front of the engine answers 503 with an empty body while
    // the instance is restarting, and 429 with a bot-challenge page under
    // a burst. Both were being reported as a healthy reader, after which
    // the extraction failed for real and the customer was told we could
    // not read their document.
    return response.ok;
  } catch {
    return false;
  }
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
/**
 * The negotiation the engine already holds for this case, if there is one.
 *
 * Exists because `cases.negotiation_id` is written AFTER the engine
 * answers. If the start times out, or the connection drops, the engine
 * can hold a real negotiation -- with a letter already sent to the
 * provider -- that this app cannot see. Retrying then sends that provider
 * a second letter about the same bill, which is the one mistake in this
 * flow a customer cannot undo.
 *
 * Matched on external_ref, which is the case id the start was given.
 */
export async function findNegotiationForCase(caseId: string): Promise<{ id: string } | null> {
  const response = await automationEngineFetch("/api/negotiations");
  const body = await readJson<unknown>(response, "negotiation list");
  const rows = Array.isArray(body)
    ? body
    : ((body as { negotiations?: unknown[] })?.negotiations ?? []);
  const match = (rows as { id?: unknown; external_ref?: unknown }[]).find(
    (row) => typeof row?.external_ref === "string" && row.external_ref === caseId,
  );
  return match && typeof match.id === "string" ? { id: match.id } : null;
}

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
// POST /api/negotiations/sync-inbox — makes the engine read its mailbox now.
//
// The engine polls IMAP every 30 seconds from an in-process task started at
// startup. On Render's free tier the service spins down after ~15 minutes
// idle and that task dies with it, so a hospital's reply sits unread until
// something wakes the engine. This is the handle that both wakes it and
// forces the poll.
//
// Returns the engine's own summary. Call it before deciding whether to send
// another follow-up: chasing a provider that has already answered is the
// worst thing this machinery can do.
export async function syncEngineInbox(): Promise<{
  status: string;
  new_messages_processed: number;
}> {
  return readJson(
    await automationEngineFetch("/api/negotiations/sync-inbox", jsonRequest("POST")),
    "inbox sync",
  );
}

// POST /api/negotiations/{id}/cadence/tick — sends the next 72-hour
// follow-up.
//
// **This endpoint does not check the clock.** The engine's own
// `autopilot_loop` checks the 72-hour gap in `_cadence_due()` before
// ticking; the endpoint checks only the status and the review hold, then
// increments and sends. So every caller must bring its own gap check —
// see followUpDecision() in src/lib/followUpCadence.ts. Calling this on a
// daily schedule without it sends a follow-up every day.
//
// The engine caps outbound follow-ups at three: past that, `cadence_tick`
// drafts a non-response notice instead of sending another letter. That cap
// is what bounds the damage if two callers ever race.
export async function tickFollowUpCadence(negotiationId: string): Promise<{
  status: string;
  action?: string;
  message?: string;
}> {
  return readJson(
    await automationEngineFetch(
      `/api/negotiations/${negotiationId}/cadence/tick`,
      jsonRequest("POST"),
    ),
    "follow-up cadence tick",
  );
}

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

// Sends a counter-offer to the provider, on the existing email thread.
//
// This is an outward-facing message to a real hospital billing department, written by a person. The
// engine does not compose it: `letterText` is dispatched as given, so whatever is passed here is what
// the provider reads. English, like everything else addressed to a provider — see src/lib/language.ts.
//
// Autopilot counters on its own when a dispute is rejected. This is the path for a case it has
// stopped on, or a figure a person wants to put rather than the one it would.
//
// Returns the negotiation itself rather than a wrapper, which is what this endpoint answers with.
export async function sendCounterOffer(
  negotiationId: string,
  counter: { revisedOffer: number; letterText: string },
): Promise<AutomationNegotiation> {
  const response = await automationEngineFetch(
    `/api/negotiations/${negotiationId}/counter`,
    jsonRequest("POST", { revised_offer: counter.revisedOffer, counter_letter_text: counter.letterText }),
  );
  return readJson<AutomationNegotiation>(response, "counter offer");
}

// Stops or restarts autopilot for one negotiation.
//
// Autopilot defaults to ON and answers the provider by itself. AUTOPILOT_HOLD_FOR_REVIEW parks
// anything resting on a finding below `high` confidence, which is the real safety net — but if a
// reply is misread there was no way to stop it carrying on. This is that switch, per case.
export async function setAutopilot(
  negotiationId: string,
  enabled: boolean,
): Promise<{ status: string; auto_pilot_enabled: boolean }> {
  const response = await automationEngineFetch(
    `/api/negotiations/${negotiationId}/toggle-autopilot`,
    jsonRequest("POST", { enabled }),
  );
  return readJson(response, "toggle autopilot");
}

// A hospital reply that arrived some way other than the engine's inbox: a letter, a fax, a scan
// forwarded to support, or a figure read out over the phone and typed up.
//
// Same endpoint as uploadRevisedBill, with `reply_type` left at the engine's default so it runs the
// general path: the document is transcribed by the vision model and handed to the same
// analyze_hospital_response an emailed reply goes through. One analysis, whichever way the reply
// arrived.
//
// At least one of `file` and `text` must carry something. The engine refuses an empty submission
// rather than inventing a placeholder — it used to substitute a fixed sentence and analyse that,
// which produced the same hardcoded answer for every reply.
export async function uploadHospitalReply(
  negotiationId: string,
  reply: { file?: { filename: string; bytes: Blob }; text?: string },
): Promise<AutomationNegotiation> {
  const body = new FormData();
  body.append("reply_text", reply.text ?? "");
  if (reply.file) {
    body.append("file", reply.file.bytes, reply.file.filename);
  }

  const response = await automationEngineFetch(`/api/negotiations/${negotiationId}/reply/upload`, {
    method: "POST",
    body,
  });
  const data = await readJson<{ negotiation: AutomationNegotiation }>(response, "hospital reply upload");
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
