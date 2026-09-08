import type { AiCaseProcessingResponse, AiHealthResponse, AiServiceConfig } from "@/types/ai";

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

export async function aiServiceFetch(path: string, init?: RequestInit): Promise<Response> {
  const config = getAiServiceConfig();

  if (!config) {
    throw new Error("AI service is not configured. Set AI_SERVICE_BASE_URL.");
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

export async function getAiHealth(): Promise<AiHealthResponse> {
  const response = await aiServiceFetch("/health");

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
