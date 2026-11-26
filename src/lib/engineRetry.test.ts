import { afterEach, describe, expect, it, vi } from "vitest";
import { engineRetryDelayMs, isEngineUnavailable, withEngineRetry } from "./engineRetry";
import { AutomationEngineError } from "./automation-engine";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** A request the free instance shed: 503 with an empty body. */
const shed = () => new AutomationEngineError("negotiation lookup failed", 503, "");

describe("isEngineUnavailable", () => {
  it.each([503, 502, 500, 429])("counts %i as the engine not serving", (status) => {
    expect(isEngineUnavailable(new AutomationEngineError("x", status, ""))).toBe(true);
  });

  // The distinction that matters: retrying these only burns the budget the
  // cases after this one still need.
  it.each([400, 404, 422])("counts %i as a bad request, not a shed one", (status) => {
    expect(isEngineUnavailable(new AutomationEngineError("x", status, ""))).toBe(false);
  });

  it("does not mistake an unrelated error for a shed request", () => {
    expect(isEngineUnavailable(new Error("socket hang up"))).toBe(false);
  });
});

describe("withEngineRetry", () => {
  const far = () => Date.now() + 600_000;

  it("returns the first answer when the engine is serving", async () => {
    const call = vi.fn().mockResolvedValue("ok");
    await expect(withEngineRetry(call, { deadline: far() })).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(1);
  });

  // The regression this whole module exists for. On 2026-11-26 the
  // negotiation sweep found seven live negotiations and advanced none of
  // them: every read was shed once and there was no second attempt, so
  // three customers whose provider had already replied were told nothing
  // for over a week.
  it("rides out a shed request and returns the retry's answer", async () => {
    vi.stubEnv("AUTOMATION_ENGINE_RETRY_DELAY_MS", "0");
    const call = vi.fn().mockRejectedValueOnce(shed()).mockResolvedValue("ok");
    await expect(withEngineRetry(call, { deadline: far() })).resolves.toBe("ok");
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("gives up after three attempts and re-throws the last failure", async () => {
    vi.stubEnv("AUTOMATION_ENGINE_RETRY_DELAY_MS", "0");
    const call = vi.fn().mockRejectedValue(shed());
    await expect(withEngineRetry(call, { deadline: far() })).rejects.toThrow(AutomationEngineError);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it("does not retry a request the engine refused on its merits", async () => {
    vi.stubEnv("AUTOMATION_ENGINE_RETRY_DELAY_MS", "0");
    const call = vi.fn().mockRejectedValue(new AutomationEngineError("no such id", 404, ""));
    await expect(withEngineRetry(call, { deadline: far() })).rejects.toThrow("no such id");
    expect(call).toHaveBeenCalledTimes(1);
  });

  // The deadline is a shared budget across every case in the sweep, so
  // this call must not sleep through what the rest of them need.
  it("stops rather than sleeping past the deadline", async () => {
    vi.stubEnv("AUTOMATION_ENGINE_RETRY_DELAY_MS", "30000");
    const call = vi.fn().mockRejectedValue(shed());
    const startedAt = Date.now();
    await expect(withEngineRetry(call, { deadline: Date.now() + 1_000 })).rejects.toThrow();
    expect(call).toHaveBeenCalledTimes(1);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });
});

describe("engineRetryDelayMs", () => {
  it("waits longer on each successive attempt", () => {
    expect(engineRetryDelayMs(1)).toBeGreaterThan(engineRetryDelayMs(0));
  });

  // The regression this exists for. A flat gap gave three attempts inside
  // 12s, which gives up while the free instance is still booting -- a boot
  // measured at 29.5s, during which every request is answered 503. One
  // upload in ten was lost to exactly that.
  it("spans a measured cold boot across three attempts", () => {
    const waited = engineRetryDelayMs(0) + engineRetryDelayMs(1);
    expect(waited).toBeGreaterThanOrEqual(15_000);
  });

  it("does not slow the common case, a single shed answered in a second", () => {
    expect(engineRetryDelayMs(0)).toBeLessThanOrEqual(5_000);
  });

  it("is read from the environment per call, not bound at import", () => {
    vi.stubEnv("AUTOMATION_ENGINE_RETRY_DELAY_MS", "0");
    expect(engineRetryDelayMs(0)).toBe(0);
    expect(engineRetryDelayMs(1)).toBe(0);
  });
});
