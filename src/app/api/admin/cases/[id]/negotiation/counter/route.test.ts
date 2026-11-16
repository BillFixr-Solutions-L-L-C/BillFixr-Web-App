import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const sendCounterOffer = vi.fn();
const setAutopilot = vi.fn();
const getNegotiation = vi.fn();
const isBackendConfigured = vi.fn();
const getDomainAccess = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));
vi.mock("@/lib/domainAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domainAccess")>()),
  getDomainAccess: (...a: unknown[]) => getDomainAccess(...a),
}));
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  sendCounterOffer: (...a: unknown[]) => sendCounterOffer(...a),
  setAutopilot: (...a: unknown[]) => setAutopilot(...a),
  getNegotiation: (...a: unknown[]) => getNegotiation(...a),
}));

const { POST, PATCH } = await import("./route");

const params = Promise.resolve({ id: "case-1" });
const LETTER =
  "Dear Billing Team, further to our dispute of account 0001000000121935 we are able to offer the following.";

const post = (body: unknown) =>
  new Request("http://localhost/api/admin/cases/case-1/negotiation/counter", {
    method: "POST",
    body: JSON.stringify(body),
  });
const patch = (body: unknown) =>
  new Request("http://localhost/api/admin/cases/case-1/negotiation/counter", {
    method: "PATCH",
    body: JSON.stringify(body),
  });

function adminCaller({ role = "admin", access = "full", negotiationId = "neg-1" as string | null } = {}) {
  serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  serverMock.queueResult("profiles", { data: { role }, error: null });
  getDomainAccess.mockResolvedValue(access);
  isBackendConfigured.mockReturnValue(true);
  serverMock.queueResult("cases", {
    data: { id: "case-1", status: "response_received", negotiation_id: negotiationId },
    error: null,
  });
  getNegotiation.mockResolvedValue({
    id: "neg-1",
    status: "PROVIDER_NO_ERROR",
    total_billed: 1818.13,
    original_balance_due: 428.53,
    settled_amount: null,
  });
  sendCounterOffer.mockResolvedValue({ id: "neg-1", status: "COUNTER_OFFER_SENT" });
  setAutopilot.mockResolvedValue({ status: "success", auto_pilot_enabled: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// The letter reaches a real hospital billing department exactly as typed,
// over our advocate address, on the existing thread.
describe("POST — sending a counter-offer", () => {
  it("sends the amount and the letter as written", async () => {
    adminCaller();

    const res = await POST(post({ amount: 150, letter: LETTER }), { params });

    expect(res.status).toBe(200);
    expect(sendCounterOffer).toHaveBeenCalledWith("neg-1", { revisedOffer: 150, letterText: LETTER });
  });

  it("does not alter the letter on its way out", async () => {
    adminCaller();
    const exact = `${LETTER}\n\nSincerely,\nBillFixr Advocate`;

    await POST(post({ amount: 150, letter: exact }), { params });

    expect(sendCounterOffer.mock.calls[0][1].letterText).toBe(exact);
  });

  it("refuses to send without a letter", async () => {
    // A blank body would be dispatched exactly as given, from our own
    // advocate address, to a hospital.
    adminCaller();

    const res = await POST(post({ amount: 150, letter: "" }), { params });

    expect(res.status).toBe(400);
    expect(sendCounterOffer).not.toHaveBeenCalled();
  });

  it("refuses a one-line letter", async () => {
    adminCaller();

    const res = await POST(post({ amount: 150, letter: "please reconsider" }), { params });

    expect(res.status).toBe(400);
    expect(sendCounterOffer).not.toHaveBeenCalled();
  });

  it("refuses an offer at or above what the client already owes", async () => {
    // Not a negotiating position — a capitulation sent by accident.
    adminCaller();

    const res = await POST(post({ amount: 428.53, letter: LETTER }), { params });

    expect(res.status).toBe(409);
    expect(sendCounterOffer).not.toHaveBeenCalled();
  });

  it("refuses once the case is settled", async () => {
    adminCaller();
    getNegotiation.mockResolvedValue({
      id: "neg-1",
      status: "SETTLEMENT_AGREED",
      total_billed: 1818.13,
      original_balance_due: 428.53,
      settled_amount: 112.49,
    });

    const res = await POST(post({ amount: 150, letter: LETTER }), { params });

    expect(res.status).toBe(409);
    expect(sendCounterOffer).not.toHaveBeenCalled();
  });

  it.each([[0], [-1], ["abc"]])("refuses a nonsense amount (%s)", async (amount) => {
    adminCaller();

    const res = await POST(post({ amount, letter: LETTER }), { params });

    expect(res.status).toBe(400);
    expect(sendCounterOffer).not.toHaveBeenCalled();
  });

  it("refuses anyone without full access to the negotiation domain", async () => {
    adminCaller({ access: "limited" });

    const res = await POST(post({ amount: 150, letter: LETTER }), { params });

    expect(res.status).toBe(403);
    expect(sendCounterOffer).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not an admin", async () => {
    adminCaller({ role: "customer" });

    const res = await POST(post({ amount: 150, letter: LETTER }), { params });

    expect(res.status).toBe(403);
    expect(sendCounterOffer).not.toHaveBeenCalled();
  });
});

describe("PATCH — the autopilot brake", () => {
  it("turns autopilot off", async () => {
    adminCaller();

    const res = await PATCH(patch({ enabled: false }), { params });

    expect(res.status).toBe(200);
    expect(setAutopilot).toHaveBeenCalledWith("neg-1", false);
  });

  it("turns it back on", async () => {
    adminCaller();

    await PATCH(patch({ enabled: true }), { params });

    expect(setAutopilot).toHaveBeenCalledWith("neg-1", true);
  });

  it("refuses anything that is not a yes or a no", async () => {
    // "off" as a string is truthy, and would turn automation on.
    adminCaller();

    const res = await PATCH(patch({ enabled: "off" }), { params });

    expect(res.status).toBe(400);
    expect(setAutopilot).not.toHaveBeenCalled();
  });

  it("refuses anyone without full access to the negotiation domain", async () => {
    adminCaller({ access: "read_only" });

    const res = await PATCH(patch({ enabled: false }), { params });

    expect(res.status).toBe(403);
    expect(setAutopilot).not.toHaveBeenCalled();
  });
});
