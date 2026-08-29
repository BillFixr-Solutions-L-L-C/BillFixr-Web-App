import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
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
});
