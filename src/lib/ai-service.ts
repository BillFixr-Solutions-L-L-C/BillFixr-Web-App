import type { AiHealthResponse, AiServiceConfig } from "@/types/ai";

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
