// The AI service client's timeout.
//
// This exists because an unbounded call is why a stalled case says nothing
// about why it stalled: the request hung until the platform killed the whole
// function, so there was no error here, no log line naming the stage, and a
// case parked at `scanning` with no record of the reason. Six cases in
// production are in exactly that state.
//
// So what is tested here is not that a fetch can succeed. It is that a slow
// or hanging AI service produces a *named* failure that a caller can report.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AiServiceTimeoutError, aiServiceFetch, getAiHealth, processCase } from "./ai-service";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  process.env.AI_SERVICE_BASE_URL = "http://ai.test";
  delete process.env.AI_SERVICE_API_KEY;
  delete process.env.AI_SERVICE_TIMEOUT_MS;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  vi.restoreAllMocks();
});

type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

function stubFetch(impl: FetchImpl) {
  const spy = vi.fn<FetchImpl>(impl);
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("aiServiceFetch", () => {
  it("passes an abort signal so a hanging service cannot hang forever", async () => {
    const spy = stubFetch(async () => new Response("{}", { status: 200 }));

    await aiServiceFetch("/v1/cases/process", { method: "POST" });

    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("turns an aborted request into a named timeout, not a generic failure", async () => {
    // Whichever name the runtime uses, the caller must be able to tell a
    // timeout apart from a refusal -- they have different fixes.
    for (const name of ["TimeoutError", "AbortError"]) {
      stubFetch(async () => {
        const err = new Error("aborted");
        err.name = name;
        throw err;
      });

      await expect(aiServiceFetch("/v1/cases/process")).rejects.toBeInstanceOf(AiServiceTimeoutError);
    }
  });

  it("does not disguise an ordinary network failure as a timeout", async () => {
    stubFetch(async () => {
      throw new TypeError("fetch failed");
    });

    const err = await aiServiceFetch("/v1/cases/process").catch((e) => e);
    expect(err).toBeInstanceOf(TypeError);
    expect(err).not.toBeInstanceOf(AiServiceTimeoutError);
  });

  it("keeps a caller's own signal instead of overriding it", async () => {
    const controller = new AbortController();
    const spy = stubFetch(async () => new Response("{}", { status: 200 }));

    await aiServiceFetch("/health", { signal: controller.signal });

    expect((spy.mock.calls[0][1] as RequestInit).signal).toBe(controller.signal);
  });

  it("never forwards timeoutMs to fetch", async () => {
    // It is ours, not RequestInit's. A stray unknown key in a fetch init is
    // ignored today but is not something to rely on.
    const spy = stubFetch(async () => new Response("{}", { status: 200 }));

    await aiServiceFetch("/health", { timeoutMs: 1234 });

    expect(spy.mock.calls[0][1]).not.toHaveProperty("timeoutMs");
  });

  it("honours an explicit budget rather than the default", async () => {
    // The health check passes a short one for this reason: a health check
    // that hangs for four minutes is not a health check. Measured by how
    // long the signal takes to fire, since AbortSignal exposes no deadline.
    const budgets: number[] = [];
    stubFetch(async (_url, init) => {
      // AbortSignal.timeout exposes no deadline, so measure the configured
      // value by how long the signal takes to fire.
      const started = Date.now();
      await new Promise<void>((resolve) => {
        (init.signal as AbortSignal).addEventListener("abort", () => resolve(), { once: true });
        setTimeout(resolve, 50);
      });
      budgets.push(Date.now() - started);
      return new Response("{}", { status: 200 });
    });

    process.env.AI_SERVICE_HEALTH_TIMEOUT_MS = "10";
    process.env.AI_SERVICE_TIMEOUT_MS = "100000";
    vi.resetModules();
    const fresh = await import("./ai-service");

    await fresh.aiServiceFetch("/health", { timeoutMs: 10 });
    expect(budgets[0]).toBeLessThan(50);
  });
});

describe("the callers that matter", () => {
  it("getAiHealth reports a timeout as a timeout", async () => {
    stubFetch(async () => {
      const err = new Error("aborted");
      err.name = "TimeoutError";
      throw err;
    });

    await expect(getAiHealth()).rejects.toBeInstanceOf(AiServiceTimeoutError);
  });

  it("processCase reports a timeout as a timeout", async () => {
    stubFetch(async () => {
      const err = new Error("aborted");
      err.name = "TimeoutError";
      throw err;
    });

    await expect(
      processCase("case-1", { filename: "bill.pdf", bytes: new Blob(["x"]) }),
    ).rejects.toBeInstanceOf(AiServiceTimeoutError);
  });

  it("the timeout message carries no hostname", async () => {
    // A previous audit finding was about leaking connection details to a
    // client through an error message. This text can reach one.
    process.env.AI_SERVICE_BASE_URL = "http://internal-ai.private.svc:8000";
    const err = new AiServiceTimeoutError("/v1/cases/process", 1000);

    expect(err.message).not.toContain("internal-ai");
    expect(err.message).not.toContain("8000");
    expect(err.message).toContain("1000ms");
  });
});
