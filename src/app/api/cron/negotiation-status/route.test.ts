import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const adminMock = createSupabaseMock();
const getNegotiation = vi.fn();
const syncEngineInbox = vi.fn();
const tickFollowUpCadence = vi.fn();
const syncCaseFromNegotiation = vi.fn();
const isBackendConfigured = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));
vi.mock("@/lib/caseStatusSync", () => ({
  syncCaseFromNegotiation: (...a: unknown[]) => syncCaseFromNegotiation(...a),
}));
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  getNegotiation: (...a: unknown[]) => getNegotiation(...a),
  syncEngineInbox: (...a: unknown[]) => syncEngineInbox(...a),
  tickFollowUpCadence: (...a: unknown[]) => tickFollowUpCadence(...a),
}));

const { GET } = await import("./route");

const SECRET = "test-cron-secret";

function request(auth = `Bearer ${SECRET}`) {
  return new Request("http://localhost/api/cron/negotiation-status", {
    headers: auth ? { authorization: auth } : {},
  });
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

/** A negotiation that is owed its next follow-up. */
function overdue(overrides: Record<string, unknown> = {}) {
  return {
    id: "neg-1",
    status: "DISPUTE_SENT",
    cadence_step: 0,
    messages: [
      {
        id: "m1",
        direction: "OUTBOUND",
        created_at: hoursAgo(80),
        sender: "a",
        recipient: "b",
        subject: "s",
        content_markdown: "c",
        status: "SENT",
      },
    ],
    ...overrides,
  };
}

function oneRunningCase() {
  adminMock.queueResult("cases", {
    data: [{ id: "case-1", user_id: "user-1", status: "awaiting_response", negotiation_id: "neg-1" }],
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.reset();
  process.env.CRON_SECRET = SECRET;
  isBackendConfigured.mockReturnValue(true);
  syncEngineInbox.mockResolvedValue({ status: "success", new_messages_processed: 0 });
  syncCaseFromNegotiation.mockResolvedValue({ changed: false, reason: "no_response_yet" });
  tickFollowUpCadence.mockResolvedValue({ status: "success", action: "followup_1_sent" });
});

describe("GET /api/cron/negotiation-status", () => {
  it("rejects a request without the cron secret", async () => {
    const res = await GET(request(""));
    expect(res.status).toBe(401);
    expect(syncEngineInbox).not.toHaveBeenCalled();
    expect(tickFollowUpCadence).not.toHaveBeenCalled();
  });

  it("skips quietly when the engine is not configured", async () => {
    isBackendConfigured.mockReturnValue(false);
    const body = await (await GET(request())).json();
    expect(body.skipped).toBeTruthy();
    expect(syncEngineInbox).not.toHaveBeenCalled();
  });

  it("reads the mailbox BEFORE reading any negotiation", async () => {
    // The ordering is the point. A reply that arrived overnight has to be
    // seen before this run decides to chase the provider again — otherwise
    // we send a follow-up to a hospital that already answered. The engine's
    // own poller dies when the free tier spins the service down, and this
    // request is usually what wakes it at all.
    const order: string[] = [];
    syncEngineInbox.mockImplementation(async () => {
      order.push("sync-inbox");
      return { status: "success", new_messages_processed: 1 };
    });
    getNegotiation.mockImplementation(async () => {
      order.push("get-negotiation");
      return overdue();
    });
    oneRunningCase();

    await GET(request());

    expect(order).toEqual(["sync-inbox", "get-negotiation"]);
  });

  it("sends the follow-up that is due", async () => {
    getNegotiation.mockResolvedValue(overdue());
    oneRunningCase();

    const body = await (await GET(request())).json();

    expect(tickFollowUpCadence).toHaveBeenCalledWith("neg-1");
    expect(body.followedUp).toBe(1);
    expect(body.checked).toBe(1);
  });

  it("does not send a follow-up before the 72-hour gap", async () => {
    // Without the gap check this daily cron would chase the provider every
    // single day: the engine's tick endpoint does not check the clock.
    getNegotiation.mockResolvedValue(overdue({ messages: [
      { id: "m1", direction: "OUTBOUND", created_at: hoursAgo(10), sender: "a", recipient: "b", subject: "s", content_markdown: "c", status: "SENT" },
    ] }));
    oneRunningCase();

    const body = await (await GET(request())).json();

    expect(tickFollowUpCadence).not.toHaveBeenCalled();
    expect(body.followedUp).toBe(0);
  });

  it("does not follow up a case it has just advanced to response_received", async () => {
    // The provider replied, so this case is not owed a chase.
    getNegotiation.mockResolvedValue(overdue());
    syncCaseFromNegotiation.mockResolvedValue({
      changed: true,
      from: "awaiting_response",
      to: "response_received",
      emailed: true,
    });
    oneRunningCase();

    const body = await (await GET(request())).json();

    expect(body.advanced).toBe(1);
    expect(body.followedUp).toBe(0);
    expect(tickFollowUpCadence).not.toHaveBeenCalled();
  });

  it("stops after the third follow-up", async () => {
    getNegotiation.mockResolvedValue(overdue({ cadence_step: 3 }));
    oneRunningCase();

    await GET(request());

    expect(tickFollowUpCadence).not.toHaveBeenCalled();
  });

  it("does not count a review hold as a follow-up sent", async () => {
    // The engine answers `needs_review` and sends nothing when a finding
    // below `high` confidence is holding the case. That is a correct
    // outcome, not a chase.
    getNegotiation.mockResolvedValue(overdue());
    tickFollowUpCadence.mockResolvedValue({ status: "needs_review", message: "Autopilot paused" });
    oneRunningCase();

    const body = await (await GET(request())).json();

    expect(tickFollowUpCadence).toHaveBeenCalledTimes(1);
    expect(body.followedUp).toBe(0);
  });

  it("still sweeps the cases when the mailbox cannot be read", async () => {
    // A mailbox we cannot reach is not a reason to skip this route's
    // original job.
    syncEngineInbox.mockRejectedValue(new Error("IMAP timeout"));
    getNegotiation.mockResolvedValue(overdue());
    oneRunningCase();

    const body = await (await GET(request())).json();

    expect(body.inboxError).toBe(true);
    expect(body.inboxMessages).toBeNull();
    expect(body.checked).toBe(1);
    expect(tickFollowUpCadence).toHaveBeenCalledTimes(1);
  });

  it("reports how many new messages the mailbox had", async () => {
    syncEngineInbox.mockResolvedValue({ status: "success", new_messages_processed: 3 });
    adminMock.queueResult("cases", { data: [], error: null });

    const body = await (await GET(request())).json();

    expect(body.inboxMessages).toBe(3);
    expect(body.inboxError).toBe(false);
  });

  it("one unreachable negotiation does not stop the rest", async () => {
    adminMock.queueResult("cases", {
      data: [
        { id: "case-1", user_id: "u", status: "awaiting_response", negotiation_id: "neg-1" },
        { id: "case-2", user_id: "u", status: "awaiting_response", negotiation_id: "neg-2" },
      ],
      error: null,
    });
    getNegotiation.mockRejectedValueOnce(new Error("engine down")).mockResolvedValue(overdue());

    const body = await (await GET(request())).json();

    expect(body.failed).toBe(1);
    expect(body.followedUp).toBe(1);
  });

  it("a failed tick is reported, not swallowed", async () => {
    getNegotiation.mockResolvedValue(overdue());
    tickFollowUpCadence.mockRejectedValue(new Error("engine refused"));
    oneRunningCase();

    const body = await (await GET(request())).json();

    expect(body.failed).toBe(1);
    expect(body.followedUp).toBe(0);
  });

  it("returns 500 when the cases query fails", async () => {
    adminMock.queueResult("cases", { data: null, error: { message: "db down" } });
    expect((await GET(request())).status).toBe(500);
  });
});
