import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));

const { GET } = await import("./route");

function makeRequest(query: string) {
  return new Request(`http://localhost/api/auth/signup-pairing/status${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/signup-pairing/status", () => {
  it("rejects a request with no id", async () => {
    const res = await GET(makeRequest(""));
    expect(res.status).toBe(400);
  });

  it("reports expired when the pairing doesn't exist", async () => {
    adminMock.queueResult("signup_pairings", { data: null, error: null });
    const res = await GET(makeRequest("?id=pairing-1"));
    expect(await res.json()).toEqual({ status: "expired" });
  });

  it("reports expired when the row is past its expiry", async () => {
    adminMock.queueResult("signup_pairings", {
      data: { status: "pending", magic_token_hash: null, expires_at: "2020-01-01T00:00:00Z" },
      error: null,
    });
    const res = await GET(makeRequest("?id=pairing-1"));
    expect(await res.json()).toEqual({ status: "expired" });
  });

  it("reports pending when not yet confirmed", async () => {
    adminMock.queueResult("signup_pairings", {
      data: { status: "pending", magic_token_hash: null, expires_at: "2999-01-01T00:00:00Z" },
      error: null,
    });
    const res = await GET(makeRequest("?id=pairing-1"));
    expect(await res.json()).toEqual({ status: "pending" });
  });

  it("hands back the token once and marks the row consumed", async () => {
    adminMock.queueResult("signup_pairings", {
      data: { status: "confirmed", magic_token_hash: "tok_abc", expires_at: "2999-01-01T00:00:00Z" },
      error: null,
    });
    adminMock.queueResult("signup_pairings", { data: null, error: null }); // the consume update

    const res = await GET(makeRequest("?id=pairing-1"));

    expect(await res.json()).toEqual({ status: "confirmed", tokenHash: "tok_abc" });
  });
});
