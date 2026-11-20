import { beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

function req(body: unknown) {
  return new Request("http://localhost/api/auth/resend-confirmation", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/auth/resend-confirmation", () => {
  it("rejects a bad email", async () => {
    expect((await POST(req({ email: "nope" }))).status).toBe(400);
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("sends a fresh link in the language asked for", async () => {
    generateLink.mockResolvedValue({ data: { properties: { hashed_token: "fresh" } }, error: null });

    const res = await POST(req({ email: "ana@example.com", language: "es" }));

    expect(res.status).toBe(200);
    const sent = sendEmail.mock.calls[0][0];
    expect(sent.subject).toBe("Confirme su cuenta de BillFixr");
    // A magic link, not a second signup link: this screen does not have
    // the password. Verifying either one proves the same thing.
    expect(String(sent.html)).toContain("type=magiclink");
    expect(String(sent.html)).toContain("token_hash=fresh");
  });

  it("answers the same way for an address with no account", async () => {
    // Otherwise this route is a way of asking who has an account.
    generateLink.mockResolvedValue({ data: null, error: { message: "User not found" } });

    const res = await POST(req({ email: "nobody@example.com", language: "en" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("answers the same way when no token comes back", async () => {
    generateLink.mockResolvedValue({ data: { properties: {} }, error: null });

    expect((await POST(req({ email: "ana@example.com" }))).status).toBe(200);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
