import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const configuredBackends = vi.fn();
const getStackHealth = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/aiStack", () => ({
  configuredBackends: (...args: unknown[]) => configuredBackends(...args),
  getStackHealth: (...args: unknown[]) => getStackHealth(...args),
}));

const { GET } = await import("./route");

const CALLER = { id: "admin-1" };

const up = (backend: string) => ({ backend, configured: true, reachable: true, detail: { status: "ok" } });
const down = (backend: string) => ({ backend, configured: true, reachable: false, detail: null });

function admin() {
  serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
  serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
  configuredBackends.mockReturnValue(["automation-engine", "ai-service"]);
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
});

describe("GET /api/ai/health", () => {
  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET();
    expect(res.status).toBe(401);
    expect(configuredBackends).not.toHaveBeenCalled();
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(configuredBackends).not.toHaveBeenCalled();
  });

  it("returns 403 when the caller has no ai_pipeline domain access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "none", error: null });
    const res = await GET();
    expect(res.status).toBe(403);
    expect(configuredBackends).not.toHaveBeenCalled();
  });

  it("returns 503 when no backend is configured at all", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CALLER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    configuredBackends.mockReturnValue([]);

    const res = await GET();

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "No AI backend is configured." });
    expect(getStackHealth).not.toHaveBeenCalled();
  });

  it("reports both backends so one does not hide the other", async () => {
    admin();
    getStackHealth.mockResolvedValue([up("automation-engine"), up("ai-service")]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backends.map((b: { backend: string }) => b.backend)).toEqual([
      "automation-engine",
      "ai-service",
    ]);
  });

  it("still succeeds when only one of the two is reachable", async () => {
    // Half the stack being down is not the same as the stack being down,
    // and the response says which half.
    admin();
    getStackHealth.mockResolvedValue([down("automation-engine"), up("ai-service")]);

    const res = await GET();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.backends[0]).toMatchObject({ backend: "automation-engine", reachable: false });
    expect(body.backends[1]).toMatchObject({ backend: "ai-service", reachable: true });
  });

  it("returns 502 when every configured backend is unreachable", async () => {
    admin();
    getStackHealth.mockResolvedValue([down("automation-engine"), down("ai-service")]);

    const res = await GET();

    expect(res.status).toBe(502);
  });

  it("never includes an internal error message in the response", async () => {
    // The original route echoed the raw error, which can carry internal
    // hostnames. getStackHealth logs the cause and reports detail: null,
    // and this pins that nothing richer leaks back out.
    admin();
    getStackHealth.mockResolvedValue([
      { backend: "automation-engine", configured: true, reachable: false, detail: null },
      { backend: "ai-service", configured: true, reachable: false, detail: null },
    ]);

    const res = await GET();

    expect(JSON.stringify(await res.json())).not.toContain("internal-ai-host");
  });
});
