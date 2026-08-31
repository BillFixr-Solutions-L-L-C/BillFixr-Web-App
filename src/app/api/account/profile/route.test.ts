import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/account/profile", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  name: "Jane Doe",
  address: "123 Main St",
  city: "Springfield",
  postalCode: "12345",
  country: "USA",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/account/profile", () => {
  it("rejects an incomplete body", async () => {
    const res = await POST(makeRequest({ name: "Jane" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("updates only the whitelisted fields for the caller's own row", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: null, error: null });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("does not let extra fields like role ride along in the update", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: null, error: null });

    await POST(makeRequest({ ...VALID_BODY, role: "admin", status: "active" }));

    const updateCall = serverMock.from.mock.results[0].value.update as ReturnType<typeof vi.fn>;
    const updatePayload = updateCall.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty("role");
    expect(updatePayload).not.toHaveProperty("status");
    expect(Object.keys(updatePayload).sort()).toEqual(["address", "city", "country", "name", "postal_code"]);
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: null, error: { message: "connection refused" } });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(500);
  });
});
