import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));

const { GET } = await import("./route");

function makeRequest(query: string) {
  return new Request(`http://localhost/auth/confirm${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /auth/confirm", () => {
  it("redirects to login with an error when token_hash is missing", async () => {
    const res = await GET(makeRequest("?type=signup"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=invalid_or_expired_link");
    expect(serverMock.verifyOtp).not.toHaveBeenCalled();
  });

  it("redirects to login with an error when type is missing", async () => {
    const res = await GET(makeRequest("?token_hash=abc123"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/login?error=invalid_or_expired_link");
  });

  it("redirects to the next path on successful verification", async () => {
    serverMock.verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(makeRequest("?token_hash=abc123&type=signup&next=/welcome"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/welcome");
    expect(serverMock.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "abc123" });
  });

  it("defaults to /dashboard when next isn't provided", async () => {
    serverMock.verifyOtp.mockResolvedValue({ error: null });
    const res = await GET(makeRequest("?token_hash=abc123&type=recovery"));
    expect(res.headers.get("location")).toBe("http://localhost/dashboard");
  });

  it("redirects to login with an error when verification fails", async () => {
    serverMock.verifyOtp.mockResolvedValue({ error: { message: "Token has expired" } });
    const res = await GET(makeRequest("?token_hash=abc123&type=signup&next=/welcome"));
    expect(res.headers.get("location")).toBe("http://localhost/login?error=invalid_or_expired_link");
  });

  it("does not touch signup_pairings for a recovery confirmation", async () => {
    serverMock.verifyOtp.mockResolvedValue({ data: { user: { id: "user-1", email: "jane@example.com" } }, error: null });
    await GET(makeRequest("?token_hash=abc123&type=recovery&next=/reset-password"));
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("resolves a pending pairing on successful signup confirmation", async () => {
    serverMock.verifyOtp.mockResolvedValue({ data: { user: { id: "user-1", email: "jane@example.com" } }, error: null });
    adminMock.queueResult("signup_pairings", { data: [{ id: "pairing-1" }], error: null });
    adminMock.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "tok_xyz" } }, error: null });
    adminMock.queueResult("signup_pairings", { data: null, error: null }); // the confirm update

    const res = await GET(makeRequest("?token_hash=abc123&type=signup&next=/welcome"));

    expect(res.headers.get("location")).toBe("http://localhost/welcome");
    expect(adminMock.generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "jane@example.com" });
  });

  it("resolves every pending row when more than one exists for the same user", async () => {
    serverMock.verifyOtp.mockResolvedValue({ data: { user: { id: "user-1", email: "jane@example.com" } }, error: null });
    adminMock.queueResult("signup_pairings", { data: [{ id: "pairing-1" }, { id: "pairing-2" }], error: null });
    adminMock.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "tok_xyz" } }, error: null });
    adminMock.queueResult("signup_pairings", { data: null, error: null });

    const res = await GET(makeRequest("?token_hash=abc123&type=signup&next=/welcome"));

    expect(res.headers.get("location")).toBe("http://localhost/welcome");
    expect(adminMock.generateLink).toHaveBeenCalledTimes(1);
  });

  it("still redirects normally when there is no pending pairing", async () => {
    serverMock.verifyOtp.mockResolvedValue({ data: { user: { id: "user-1", email: "jane@example.com" } }, error: null });
    adminMock.queueResult("signup_pairings", { data: [], error: null });

    const res = await GET(makeRequest("?token_hash=abc123&type=signup&next=/welcome"));

    expect(res.headers.get("location")).toBe("http://localhost/welcome");
    expect(adminMock.generateLink).not.toHaveBeenCalled();
  });

  it("still redirects normally even if resolving the pairing throws", async () => {
    serverMock.verifyOtp.mockResolvedValue({ data: { user: { id: "user-1", email: "jane@example.com" } }, error: null });
    adminMock.from.mockImplementationOnce(() => {
      throw new Error("db down");
    });

    const res = await GET(makeRequest("?token_hash=abc123&type=signup&next=/welcome"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost/welcome");
  });
});
