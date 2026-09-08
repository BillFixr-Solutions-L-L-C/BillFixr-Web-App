import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const getAiServiceConfig = vi.fn();
const getAiHealth = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/ai-service", () => ({
  getAiServiceConfig: (...args: unknown[]) => getAiServiceConfig(...args),
  getAiHealth: (...args: unknown[]) => getAiHealth(...args),
}));

const { GET } = await import("./route");

const CALLER = { id: "admin-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/ai/health", () => {
  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getAiServiceConfig).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(getAiServiceConfig).not.toHaveBeenCalled();
  });

  it("returns 503 when the AI service isn't configured, for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    getAiServiceConfig.mockReturnValue(null);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "AI service is not configured." });
  });

  it("returns the health payload for an admin caller when the service is up", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    getAiServiceConfig.mockReturnValue({ baseUrl: "http://internal" });
    getAiHealth.mockResolvedValue({ status: "ok" });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns a generic 502 without leaking the internal error message", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    getAiServiceConfig.mockReturnValue({ baseUrl: "http://internal" });
    getAiHealth.mockRejectedValue(new Error("getaddrinfo ENOTFOUND internal-ai-host.internal"));

    const res = await GET();

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Failed to reach the AI service.");
    expect(JSON.stringify(body)).not.toContain("internal-ai-host");
  });
});
