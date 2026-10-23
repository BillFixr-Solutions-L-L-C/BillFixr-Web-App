import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  automationEngineFetch,
  confirmCompletionPayment,
  fetchRevisedBillPdf,
  getAutomationEngineConfig,
  getNegotiation,
  startNegotiation,
} from "./automation-engine";
import type { AutomationAuditResult } from "@/types/automation-engine";

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function lastCall(): { url: string; init: RequestInit & { headers: Headers } } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: url as string, init: init as RequestInit & { headers: Headers } };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("AUTOMATION_ENGINE_BASE_URL", "https://engine.example.com/");
  vi.stubEnv("AUTOMATION_ENGINE_API_KEY", "engine-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("automation engine client", () => {
  it("is not configured without a base URL", () => {
    vi.stubEnv("AUTOMATION_ENGINE_BASE_URL", "");
    expect(getAutomationEngineConfig()).toBeNull();
  });

  it("trims the trailing slash and sends the API key", async () => {
    fetchMock.mockResolvedValue(jsonResponse({}));
    await automationEngineFetch("/api/health");

    const { url, init } = lastCall();
    expect(url).toBe("https://engine.example.com/api/health");
    expect(init.headers.get("X-API-Key")).toBe("engine-key");
  });

  it("refuses to call an engine that is not configured", async () => {
    vi.stubEnv("AUTOMATION_ENGINE_BASE_URL", "");
    await expect(automationEngineFetch("/api/health")).rejects.toThrow("not configured");
  });

  it("starts a negotiation with the payment reference and the case fee rate", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ id: "neg-1", status: "DISPATCHED" }));
    const auditResult = { issues: [], total_billed: 500 } as unknown as AutomationAuditResult;

    const negotiation = await startNegotiation({
      auditResult,
      initialOffer: 150,
      hospitalEmail: "billing@hospital.example",
      commitmentPaymentRef: "pi_commit",
      completionFeeRate: 0.15,
    });

    expect(negotiation.id).toBe("neg-1");
    const { url, init } = lastCall();
    expect(url).toBe("https://engine.example.com/api/negotiations/start");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      initial_offer: 150,
      hospital_email: "billing@hospital.example",
      commitment_paid: true,
      commitment_payment_ref: "pi_commit",
      completion_fee_rate: 0.15,
    });
  });

  it("includes the status and detail when the engine rejects a call", async () => {
    fetchMock.mockResolvedValue(new Response("not found", { status: 404 }));
    await expect(getNegotiation("missing")).rejects.toThrow("status 404: not found");
  });

  it("confirms the completion payment with its reference", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ negotiation: { id: "neg-1", status: "COMPLETED" } }));
    const negotiation = await confirmCompletionPayment("neg-1", "pi_done");

    expect(negotiation.status).toBe("COMPLETED");
    const { url, init } = lastCall();
    expect(url).toBe("https://engine.example.com/api/negotiations/neg-1/pay/completion");
    expect(JSON.parse(init.body as string)).toEqual({ payment_reference: "pi_done" });
  });

  it("passes the paywall response through when the bill is still locked", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 402 }));
    const response = await fetchRevisedBillPdf("neg-1");

    expect(response.status).toBe(402);
    expect(lastCall().url).toBe("https://engine.example.com/api/negotiations/neg-1/revised-bill/pdf");
  });
});
