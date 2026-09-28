import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const processCase = vi.fn();
const getAiServiceConfig = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/ai-service", () => ({
  processCase: (...a: unknown[]) => processCase(...a),
  getAiServiceConfig: () => getAiServiceConfig(),
}));

const { POST } = await import("./route");

const params = Promise.resolve({ id: "bill-1" });
const USER = { id: "user-1" };
const BILL: Record<string, string | null> = {
  id: "bill-1",
  user_id: USER.id,
  filename: "bill.pdf",
  storage_url: "user-1/bill.pdf",
  provider_name: null,
  provider_email: null,
  provider_phone: null,
  provider_address: null,
  service_date: null,
  statement_date: null,
};

const AI_RESULT = {
  processed_documents: [
    {
      extraction: {
        provider: { name: "Riverside General", email: "billing@riverside.com", phone: "555-0100", address: "2 Care Rd" },
        date_of_service_start: "2026-07-14",
        statement_date: "2026-07-20",
      },
    },
  ],
  analysis: { issues: [{ severity: "error" }], savings_opportunities: [], summary: "secret findings" },
  draft: { body: "secret letter" },
};

function req() {
  return new Request("http://localhost/x", { method: "POST" });
}

function ownsBill(bill = BILL) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("bills", { data: bill, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  getAiServiceConfig.mockReturnValue({ baseUrl: "http://ai" });
  adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf"]), error: null });
});

describe("POST /api/dashboard/bills/[id]/extract", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req(), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's bill and never calls the AI", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: { ...BILL, user_id: "other" }, error: null });
    expect((await POST(req(), { params })).status).toBe(404);
    expect(processCase).not.toHaveBeenCalled();
  });

  it("degrades gracefully when the AI isn't configured", async () => {
    getAiServiceConfig.mockReturnValue(null);
    ownsBill();
    const res = await POST(req(), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).fields).toBeNull();
  });

  it("returns only the identifying fields, never the analysis or letter", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    processCase.mockResolvedValue(AI_RESULT);
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fields).toEqual({
      hospitalName: "Riverside General",
      billingManagerEmail: "billing@riverside.com",
      hospitalAddress: "2 Care Rd",
      billingPhone: "555-0100",
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("secret findings");
    expect(serialized).not.toContain("secret letter");
  });

  it("reuses a cached reading instead of paying for a second AI call", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: { result: AI_RESULT }, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(processCase).not.toHaveBeenCalled();
  });

  it("does not overwrite details the customer already entered", async () => {
    ownsBill({ ...BILL, provider_name: "Typed By Customer" });
    adminMock.queueResult("bill_extractions", { data: { result: AI_RESULT }, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const body = await (await POST(req(), { params })).json();

    expect(body.fields.hospitalName).toBe("Typed By Customer");
  });

  it("reports a document it cannot read", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    processCase.mockRejectedValue(new Error("ai down"));
    const res = await POST(req(), { params });
    expect(res.status).toBe(502);
    expect((await res.json()).fields).toBeNull();
  });
});
