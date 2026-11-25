import { afterEach, describe, expect, it, vi } from "vitest";
import { engineRetryDelayMs } from "./engineRetry";

afterEach(() => {
  vi.unstubAllEnvs();
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
