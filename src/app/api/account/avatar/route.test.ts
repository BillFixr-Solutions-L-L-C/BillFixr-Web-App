import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/account/avatar", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/account/avatar", () => {
  it("rejects a missing avatarUrl", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects an oversized avatarUrl", async () => {
    const res = await POST(makeRequest({ avatarUrl: "a".repeat(2049) }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ avatarUrl: "https://example.org/a.png" }));
    expect(res.status).toBe(401);
  });

  it("updates the caller's own avatar_url", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: null, error: null });

    const res = await POST(makeRequest({ avatarUrl: "https://example.org/a.png" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: null, error: { message: "connection refused" } });

    const res = await POST(makeRequest({ avatarUrl: "https://example.org/a.png" }));

    expect(res.status).toBe(500);
  });
});
