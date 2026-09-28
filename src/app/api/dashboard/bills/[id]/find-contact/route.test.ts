import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const findProviderContact = vi.fn();
const getAiServiceConfig = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/ai-service", () => ({
  findProviderContact: (...a: unknown[]) => findProviderContact(...a),
  getAiServiceConfig: () => getAiServiceConfig(),
}));

const { POST } = await import("./route");

const params = Promise.resolve({ id: "bill-1" });
const USER = { id: "user-1" };
const BILL: Record<string, string | null> = {
  id: "bill-1",
  user_id: USER.id,
  provider_name: "Riverside General",
  provider_address: "2 Care Rd",
  provider_email: null,
  provider_support_email: null,
};

function req(body: unknown) {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}
function owns(bill = BILL) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("bills", { data: bill, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  getAiServiceConfig.mockReturnValue({ baseUrl: "http://ai" });
});

describe("POST /api/dashboard/bills/[id]/find-contact", () => {
  it("rejects a field it doesn't look up", async () => {
    expect((await POST(req({ field: "hospitalName" }), { params })).status).toBe(400);
    expect((await POST(req({}), { params })).status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req({ field: "supportEmail" }), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's bill and never searches", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: { ...BILL, user_id: "other" }, error: null });
    expect((await POST(req({ field: "supportEmail" }), { params })).status).toBe(404);
    expect(findProviderContact).not.toHaveBeenCalled();
  });

  it("asks for the hospital name first, since that's what it searches on", async () => {
    owns({ ...BILL, provider_name: null });
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/hospital name first/i);
    expect(findProviderContact).not.toHaveBeenCalled();
  });

  it("degrades gracefully when the AI isn't configured", async () => {
    getAiServiceConfig.mockReturnValue(null);
    owns();
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).value).toBeNull();
  });

  it("returns the billing address it found and stores it", async () => {
    owns();
    findProviderContact.mockResolvedValue({ billing_email: "billing@riverside.com", support_email: "s@r.com", phone: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req({ field: "billingManagerEmail" }), { params });

    expect(res.status).toBe(200);
    expect((await res.json()).value).toBe("billing@riverside.com");
    expect(findProviderContact).toHaveBeenCalledWith({ name: "Riverside General", address: "2 Care Rd" });
    expect(adminMock.from).toHaveBeenCalledWith("bills");
  });

  it("returns the support address for the support field", async () => {
    owns();
    findProviderContact.mockResolvedValue({ billing_email: "b@r.com", support_email: "support@riverside.com", phone: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req({ field: "supportEmail" }), { params });

    expect((await res.json()).value).toBe("support@riverside.com");
  });

  it("does not overwrite an address the customer already entered", async () => {
    owns({ ...BILL, provider_email: "typed@customer.com" });
    findProviderContact.mockResolvedValue({ billing_email: "billing@riverside.com", support_email: null, phone: null });

    const res = await POST(req({ field: "billingManagerEmail" }), { params });

    expect(res.status).toBe(200);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("reports nothing found rather than erroring", async () => {
    owns();
    findProviderContact.mockResolvedValue({ billing_email: null, support_email: null, phone: null });
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).value).toBeNull();
  });

  it("reports a failed lookup as something the customer can type instead", async () => {
    owns();
    findProviderContact.mockRejectedValue(new Error("404 not implemented"));
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/type it in/i);
  });
});
