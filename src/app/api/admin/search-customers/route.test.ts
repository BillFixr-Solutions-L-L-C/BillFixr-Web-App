import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { GET } = await import("./route");

function makeRequest(q: string) {
  return new Request(`http://localhost/api/admin/search-customers?q=${encodeURIComponent(q)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/admin/search-customers", () => {
  it("returns an empty list for an empty query without touching auth", async () => {
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [] });
    expect(serverMock.getUser).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest("jane"));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await GET(makeRequest("jane"));
    expect(res.status).toBe(403);
  });

  it("returns matching customers for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("profiles", {
      data: [{ id: "cust-1", name: "Jane Doe", email: "jane@example.org" }],
      error: null,
    });

    const res = await GET(makeRequest("jane"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ id: "cust-1", name: "Jane Doe", email: "jane@example.org" }] });
  });
});
