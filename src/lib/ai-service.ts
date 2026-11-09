import type { AiCaseProcessingResponse, AiHealthResponse, AiServiceConfig } from "@/types/ai";

// Reading a bill is slow on purpose: the AI service downloads the file,
// runs tesseract over it, then calls a model. On Render's free tier a cold
// instance adds most of a minute before any of that starts. So this is
// generous -- but it is not unbounded, which is what it was.
//
// An unbounded call is the reason a stalled case says nothing about why.
// Without a timeout the request hangs until the platform kills the whole
// function, which produces no error here, no log line naming the stage,
// and a case parked at `scanning` forever. A timeout we own turns that into
// an error we can attribute.
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS ?? 240_000);

// A health check that hangs for four minutes is not a health check.
const HEALTH_TIMEOUT_MS = Number(process.env.AI_SERVICE_HEALTH_TIMEOUT_MS ?? 20_000);

/** The AI service did not answer in time. Distinct so callers can say so. */
export class AiServiceTimeoutError extends Error {
  constructor(
    readonly path: string,
    readonly timeoutMs: number,
  ) {
    // Deliberately no hostname in the message: this text can reach a
    // client, and a previous audit finding was about leaking connection
    // details that way.
    super(`AI service did not respond within ${timeoutMs}ms.`);
    this.name = "AiServiceTimeoutError";
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getAiServiceConfig(): AiServiceConfig | null {
  const baseUrl = process.env.AI_SERVICE_BASE_URL;

  if (!baseUrl) {
    return null;
  }

  return {
    baseUrl: trimTrailingSlash(baseUrl),
    apiKey: process.env.AI_SERVICE_API_KEY,
  };
}

export async function aiServiceFetch(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<Response> {
  const config = getAiServiceConfig();

  if (!config) {
    throw new Error("AI service is not configured. Set AI_SERVICE_BASE_URL.");
  }

  const headers = new Headers(init?.headers);
  if (config.apiKey) {
    headers.set("X-API-Key", config.apiKey);
  }

  // timeoutMs is ours, not RequestInit's -- it must not reach fetch.
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
      throw new AiServiceTimeoutError(path, budget);
    }
    throw err;
  }
}

export async function getAiHealth(): Promise<AiHealthResponse> {
  const response = await aiServiceFetch("/health", { timeoutMs: HEALTH_TIMEOUT_MS });

  if (!response.ok) {
    throw new Error(`AI service health check failed with status ${response.status}.`);
  }

  return (await response.json()) as AiHealthResponse;
}

// POST /v1/cases/process — single call that stores the document(s), runs
// extraction, and returns case-level audit/savings/draft output in one
// response. `caseId` is passed straight through as the AI service's own
// case_id (both sides use the same uuid — nothing to reconcile).
export async function processCase(
  caseId: string,
  file: { filename: string; bytes: Blob },
): Promise<AiCaseProcessingResponse> {
  const body = new FormData();
  body.append("case_id", caseId);
  body.append("use_ai", "true");
  body.append("files", file.bytes, file.filename);

  const response = await aiServiceFetch("/v1/cases/process", {
    method: "POST",
    body,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI service case processing failed with status ${response.status}: ${detail}`);
  }

  return (await response.json()) as AiCaseProcessingResponse;
}

// A hospital's billing-manager and support email addresses are not printed
// on a bill, so unlike everything else on the information step these can't
// be extracted from the document — they have to be looked up from outside
// it. That lookup belongs to the AI service.
//
// CONTRACT STUB: the AI service does not expose this endpoint yet (it
// currently serves document ingestion/extraction/analysis only). Written
// against the shape we need so it starts working the moment that endpoint
// ships; until then the call 404s and the caller reports the lookup as
// unavailable, leaving the customer to type the address in. Same
// activate-automatically-later shape used elsewhere in this codebase.
export type AiProviderContact = {
  billing_email: string | null;
  support_email: string | null;
  phone: string | null;
};

export async function findProviderContact(provider: {
  name: string;
  address?: string | null;
}): Promise<AiProviderContact> {
  const response = await aiServiceFetch("/v1/providers/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: provider.name, address: provider.address ?? null }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`AI provider contact lookup failed with status ${response.status}: ${detail}`);
  }

  return (await response.json()) as AiProviderContact;
}
