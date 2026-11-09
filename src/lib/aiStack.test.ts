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
      provider_name: "Riverside General",
      billing_url: null,
      notes: "",
      verification_status: "verified",
    });

    const contact = await findProviderContact(HOSPITAL);

    expect(aiContact).not.toHaveBeenCalled();
    expect(contact).toEqual({
      billing_email: "billing@riverside.test",
      support_email: null,
      phone: null,
      provider_name: "Riverside General",
      billing_url: null,
      notes: "",
      verification_status: "verified",
      // The engine answered from its curated directory, so there is no
      // registry record behind this one. Asserted explicitly rather than
      // left off: toEqual treats a missing key and an undefined one as
      // equal, so omitting these would pass even if the seam dropped them.
      mailing_address: null,
      npi: null,
      facility_type: null,
      fax: null,
      // Curated, so nothing was searched for and there is no page behind it.
      email_source_url: null,
      candidates: [],
      source: "automation-engine",
    });
  });

  it("carries the engine's phone, billing page and notes, which is all most hospitals publish", async () => {
    // billing_email is null for most hospitals -- 3 of the 16 providers in
    // the engine's directory have one. These three fields are what the
    // customer is actually left with, and the seam used to drop them, which
    // turned a usable billing line into a dead end at the UI.
    process.env.AUTOMATION_ENGINE_BASE_URL = "https://engine.test";
    engineContact.mockResolvedValue({
      billing_email: null,
      support_email: null,
      phone: "800-242-7416",
      provider_name: "Ascension Saint Thomas Rutherford",
      billing_url: "https://example.test/billing",
      sources: ["https://example.test/billing"],
      verification_status: "listed",
      notes: "This hospital publishes no billing email.",
    });

    const contact = await findProviderContact(HOSPITAL);

    expect(contact.phone).toBe("800-242-7416");
    expect(contact.provider_name).toBe("Ascension Saint Thomas Rutherford");
    expect(contact.billing_url).toBe("https://example.test/billing");
    expect(contact.notes).toMatch(/no billing email/i);
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
