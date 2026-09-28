import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));

const { POST } = await import("./route");

const params = Promise.resolve({ id: "case-1" });
const ADMIN = { id: "admin-1" };

// The route only ever calls request.formData(), so hand it the form
// directly. Round-tripping through a real multipart Request isn't faithful
// here anyway — jsdom and undici each bring their own File class, and a
// 10MB body doesn't survive the re-parse.
function makeRequest(fields: Record<string, string | File>) {
  const body = new FormData();
  for (const [k, v] of Object.entries(fields)) body.append(k, v);
  return { formData: async () => body } as unknown as Request;
}

function pdf(name = "response.pdf", size = 1000) {
  return new File(["x".repeat(size)], name, { type: "application/pdf" });
}

function allowAdmin() {
  serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
  serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  adminMock.storageRemove.mockResolvedValue({ data: null, error: null });
});

describe("POST /api/admin/cases/[id]/documents", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(makeRequest({ type: "new_bill", file: pdf() }), { params })).status).toBe(401);
  });

  it("returns 403 for a non-admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    expect((await POST(makeRequest({ type: "new_bill", file: pdf() }), { params })).status).toBe(403);
  });

  it("returns 403 for an admin without full client_data access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "read_only", error: null });
    expect((await POST(makeRequest({ type: "new_bill", file: pdf() }), { params })).status).toBe(403);
  });

  it("rejects an unknown document type", async () => {
    allowAdmin();
    expect((await POST(makeRequest({ type: "original_bill", file: pdf() }), { params })).status).toBe(400);
  });

  it("rejects a disallowed file type and an oversized file", async () => {
    allowAdmin();
    const exe = new File(["xxxxxxxxxx"], "x.exe", { type: "application/x-msdownload" });
    expect((await POST(makeRequest({ type: "new_bill", file: exe }), { params })).status).toBe(400);

    allowAdmin();
    const huge = pdf("big.pdf", 10 * 1024 * 1024 + 1);
    expect((await POST(makeRequest({ type: "new_bill", file: huge }), { params })).status).toBe(400);
  });

  it("returns 404 when the case doesn't exist", async () => {
    allowAdmin();
    serverMock.queueResult("cases", { data: null, error: null });
    expect((await POST(makeRequest({ type: "new_bill", file: pdf() }), { params })).status).toBe(404);
  });

  it("uploads into the customer's own folder and records the row plus an audit entry", async () => {
    allowAdmin();
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: "cust-9" }, error: null });
    adminMock.storageUpload.mockResolvedValue({ data: { path: "p" }, error: null });
    adminMock.queueResult("case_documents", { data: { id: "doc-1" }, error: null });
    serverMock.queueResult("profiles", { data: { name: "Admin Jane" }, error: null });

    const res = await POST(makeRequest({ type: "provider_response", file: pdf() }), { params });

    expect(res.status).toBe(200);
    const [path] = adminMock.storageUpload.mock.calls[0];
    expect(path).toMatch(/^cust-9\/case-documents\/case-1\//);
    expect(adminMock.from).toHaveBeenCalledWith("case_documents");
    expect(adminMock.from).toHaveBeenCalledWith("admin_activity_log");
  });

  it("removes the uploaded object if the row insert fails", async () => {
    allowAdmin();
    serverMock.queueResult("cases", { data: { id: "case-1", user_id: "cust-9" }, error: null });
    adminMock.storageUpload.mockResolvedValue({ data: { path: "p" }, error: null });
    adminMock.queueResult("case_documents", { data: null, error: { message: "insert failed" } });

    const res = await POST(makeRequest({ type: "new_bill", file: pdf() }), { params });

    expect(res.status).toBe(500);
    expect(adminMock.storageRemove).toHaveBeenCalled();
  });
});
