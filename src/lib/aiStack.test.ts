import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engineHealth = vi.fn();
const engineContact = vi.fn();
const aiHealth = vi.fn();
const aiContact = vi.fn();

vi.mock("./automation-engine", async () => {
  const actual = await vi.importActual<typeof import("./automation-engine")>("./automation-engine");
  return {
    ...actual,
    getEngineHealth: () => engineHealth(),
    findProviderContact: (p: unknown) => engineContact(p),
  };
});
vi.mock("./ai-service", async () => {
  const actual = await vi.importActual<typeof import("./ai-service")>("./ai-service");
  return {
    ...actual,
    getAiHealth: () => aiHealth(),
    findProviderContact: (p: unknown) => aiContact(p),
  };
});

const { configuredBackends, preferredBackend, getStackHealth, findProviderContact } = await import("./aiStack");

const HOSPITAL = { name: "Riverside General", address: "1 Main St" };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AUTOMATION_ENGINE_BASE_URL;
  delete process.env.AI_SERVICE_BASE_URL;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.AUTOMATION_ENGINE_BASE_URL;
  delete process.env.AI_SERVICE_BASE_URL;
});

describe("configuration", () => {
  it("reports nothing configured when neither base URL is set", () => {
    expect(configuredBackends()).toEqual([]);
    expect(preferredBackend()).toBeNull();
  });

  it("prefers the engine when both are configured", () => {
    process.env.AUTOMATION_ENGINE_BASE_URL = "https://engine.test";
    process.env.AI_SERVICE_BASE_URL = "https://ai.test";
    expect(configuredBackends()).toEqual(["automation-engine", "ai-service"]);
    expect(preferredBackend()).toBe("automation-engine");
  });

  it("falls back to ai-service when only it is configured", () => {
    process.env.AI_SERVICE_BASE_URL = "https://ai.test";
    expect(preferredBackend()).toBe("ai-service");
  });
});

describe("getStackHealth", () => {
  it("marks an unconfigured backend as never asked rather than unreachable", async () => {
    const health = await getStackHealth();
    // reachable: null, not false — nothing was tried, so nothing is down.
    expect(health).toEqual([
      { backend: "automation-engine", configured: false, reachable: null, detail: null },
      { backend: "ai-service", configured: false, reachable: null, detail: null },
    ]);
    expect(engineHealth).not.toHaveBeenCalled();
    expect(aiHealth).not.toHaveBeenCalled();
  });

  it("reports each backend separately so one failure doesn't mask the other", async () => {
    process.env.AUTOMATION_ENGINE_BASE_URL = "https://engine.test";
    process.env.AI_SERVICE_BASE_URL = "https://ai.test";
    engineHealth.mockRejectedValue(new Error("connection refused"));
    aiHealth.mockResolvedValue({ status: "ok" });

    const health = await getStackHealth();

    expect(health[0]).toMatchObject({ backend: "automation-engine", configured: true, reachable: false });
    expect(health[1]).toMatchObject({ backend: "ai-service", configured: true, reachable: true });
  });
});

describe("findProviderContact", () => {
  it("refuses rather than reporting an empty result when nothing is configured", async () => {
    // "Not set up" and "looked and found nothing" need different answers
    // for the customer, so this must not quietly return nulls.
    await expect(findProviderContact(HOSPITAL)).rejects.toThrow(/No AI backend is configured/);
  });

  it("asks the engine when both are available, and carries its verification status", async () => {
    process.env.AUTOMATION_ENGINE_BASE_URL = "https://engine.test";
    process.env.AI_SERVICE_BASE_URL = "https://ai.test";
    engineContact.mockResolvedValue({
      billing_email: "billing@riverside.test",
      support_email: null,
      phone: null,
      verification_status: "verified",
    });

    const contact = await findProviderContact(HOSPITAL);

    expect(aiContact).not.toHaveBeenCalled();
    expect(contact).toEqual({
      billing_email: "billing@riverside.test",
      support_email: null,
      phone: null,
      verification_status: "verified",
      source: "automation-engine",
    });
  });

  it("uses ai-service when the engine isn't configured, with no verification status to report", async () => {
    process.env.AI_SERVICE_BASE_URL = "https://ai.test";
    aiContact.mockResolvedValue({ billing_email: "b@x.test", support_email: "s@x.test", phone: "123" });

    const contact = await findProviderContact(HOSPITAL);

    expect(engineContact).not.toHaveBeenCalled();
    expect(contact).toMatchObject({ source: "ai-service", verification_status: null, billing_email: "b@x.test" });
  });

  it("lets a backend failure through rather than passing it off as no result", async () => {
    process.env.AUTOMATION_ENGINE_BASE_URL = "https://engine.test";
    engineContact.mockRejectedValue(new Error("engine exploded"));

    await expect(findProviderContact(HOSPITAL)).rejects.toThrow(/engine exploded/);
  });
});
