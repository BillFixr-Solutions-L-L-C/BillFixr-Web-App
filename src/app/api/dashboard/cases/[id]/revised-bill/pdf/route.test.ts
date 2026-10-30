import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const fetchRevisedBillPdf = vi.fn();
const isBackendConfigured = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/automation-engine", () => ({
  fetchRevisedBillPdf: (...a: unknown[]) => fetchRevisedBillPdf(...a),
}));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));

const { GET } = await import("./route");

const params = Promise.resolve({ id: "case-1" });
const USER = { id: "user-1" };
const OWN_CASE = { id: "case-1", user_id: USER.id, negotiation_id: "neg-1" };
const request = () => new Request("http://localhost/api/dashboard/cases/case-1/revised-bill/pdf");

function pdfReady(caseRow = OWN_CASE) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("cases", { data: caseRow, error: null });
  isBackendConfigured.mockReturnValue(true);
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/dashboard/cases/[id]/revised-bill/pdf", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request(), { params })).status).toBe(401);
    expect(fetchRevisedBillPdf).not.toHaveBeenCalled();
  });

  it("will not hand one customer another customer's bill", async () => {
    // The engine trusts the API key, so this check is the only thing
    // protecting the file.
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, user_id: "someone-else" }, error: null });

    expect((await GET(request(), { params })).status).toBe(404);
    expect(fetchRevisedBillPdf).not.toHaveBeenCalled();
  });

  it("returns 404 when the case has no negotiation", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: { ...OWN_CASE, negotiation_id: null }, error: null });

    expect((await GET(request(), { params })).status).toBe(404);
    expect(fetchRevisedBillPdf).not.toHaveBeenCalled();
  });

  it("returns 503 when the engine isn't configured", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("cases", { data: OWN_CASE, error: null });
    isBackendConfigured.mockReturnValue(false);

    expect((await GET(request(), { params })).status).toBe(503);
    expect(fetchRevisedBillPdf).not.toHaveBeenCalled();
  });

  it("streams the PDF for the owner", async () => {
    pdfReady();
    fetchRevisedBillPdf.mockResolvedValue(
      new Response("%PDF-1.4 bytes", { status: 200, headers: { "Content-Type": "application/pdf" } }),
    );

    const res = await GET(request(), { params });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("revised-bill-case-1.pdf");
    expect(await res.text()).toBe("%PDF-1.4 bytes");
    expect(fetchRevisedBillPdf).toHaveBeenCalledWith("neg-1");
  });

  it("passes the engine's paywall through as a 402", async () => {
    pdfReady();
    fetchRevisedBillPdf.mockResolvedValue(new Response("unpaid", { status: 402 }));

    const res = await GET(request(), { params });

    expect(res.status).toBe(402);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  it("does not leak the engine's error body", async () => {
    // The engine's 500 body can name internal paths; only the status
    // crosses over.
    pdfReady();
    fetchRevisedBillPdf.mockResolvedValue(
      new Response("/app/data/revised_bills/neg-1.pdf missing", { status: 500 }),
    );

    const res = await GET(request(), { params });

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("/app/data");
  });

  it("returns 502 when the engine is unreachable", async () => {
    pdfReady();
    fetchRevisedBillPdf.mockRejectedValue(new Error("ECONNREFUSED"));

    expect((await GET(request(), { params })).status).toBe(502);
  });

  it("never caches the bill", async () => {
    pdfReady();
    fetchRevisedBillPdf.mockResolvedValue(new Response("%PDF", { status: 200 }));

    const res = await GET(request(), { params });

    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });
});
