import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));

const { GET } = await import("./route");

const params = Promise.resolve({ id: "case-1234abcd" });
const ADMIN = { id: "admin-1" };
const LETTER = "Dear Billing Department,\n\nWe dispute the charges on this account.";

function request(url = "https://app.test/api/admin/cases/case-1234abcd/appeal-letter") {
  return new Request(url);
}

function allowAdmin(access = "full") {
  serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
  serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
  serverMock.rpc.mockResolvedValue({ data: access, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
});

describe("GET /api/admin/cases/[id]/appeal-letter", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await GET(request(), { params })).status).toBe(401);
  });

  it("returns 403 for a signed-in customer", async () => {
    // A customer reads their own letter on their own screen. This route
    // can read any case, so it must never answer one.
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    expect((await GET(request(), { params })).status).toBe(403);
  });

  it("returns 403 for an admin with no client_data access", async () => {
    allowAdmin("none");
    expect((await GET(request(), { params })).status).toBe(403);
  });

  it("serves a letter to an admin with read-only client_data access", async () => {
    // Read access is the right gate: looking at a letter writes nothing.
    allowAdmin("read");
    serverMock.queueResult("cases", { data: { id: "case-1", appeal_letter_text: LETTER }, error: null });

    const res = await GET(request(), { params });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders the letter inline by default and as a download when asked", async () => {
    allowAdmin();
    serverMock.queueResult("cases", { data: { id: "case-1", appeal_letter_text: LETTER }, error: null });
    const inline = await GET(request(), { params });
    expect(inline.headers.get("content-disposition")).toContain("inline");

    serverMock.reset();
    allowAdmin();
    serverMock.queueResult("cases", { data: { id: "case-1", appeal_letter_text: LETTER }, error: null });
    const download = await GET(
      request("https://app.test/api/admin/cases/case-1234abcd/appeal-letter?download=1"),
      { params },
    );
    expect(download.headers.get("content-disposition")).toContain("attachment");
    expect(download.headers.get("content-disposition")).toContain("appeal-letter-case-123.pdf");
  });

  it("is never cached, since the letter is editable until it is sent", async () => {
    allowAdmin();
    serverMock.queueResult("cases", { data: { id: "case-1", appeal_letter_text: LETTER }, error: null });
    const res = await GET(request(), { params });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 404 when no letter has been written yet", async () => {
    allowAdmin();
    serverMock.queueResult("cases", { data: { id: "case-1", appeal_letter_text: null }, error: null });
    expect((await GET(request(), { params })).status).toBe(404);
  });

  it("returns 404 for a case that does not exist", async () => {
    allowAdmin();
    serverMock.queueResult("cases", { data: null, error: { message: "no rows" } });
    expect((await GET(request(), { params })).status).toBe(404);
  });
});
