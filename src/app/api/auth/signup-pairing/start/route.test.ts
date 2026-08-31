import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup-pairing/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/signup-pairing/start", () => {
  it("rejects a non-string userId", async () => {
    const res = await POST(makeRequest({ userId: 42 }));
    expect(res.status).toBe(400);
  });

  it("rejects when the user doesn't exist", async () => {
    adminMock.getUserById.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest({ userId: "user-1" }));
    expect(res.status).toBe(400);
  });

  it("rejects when the user is already confirmed", async () => {
    adminMock.getUserById.mockResolvedValue({ data: { user: { email_confirmed_at: "2026-01-01" } } });
    const res = await POST(makeRequest({ userId: "user-1" }));
    expect(res.status).toBe(400);
  });

  it("creates a pairing row for an unconfirmed user", async () => {
    adminMock.getUserById.mockResolvedValue({ data: { user: { email_confirmed_at: null } } });
    adminMock.queueResult("signup_pairings", { data: { id: "pairing-1" }, error: null });

    const res = await POST(makeRequest({ userId: "user-1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pairingId: "pairing-1" });
  });
});
