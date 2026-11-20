import { beforeEach, describe, expect, it, vi } from "vitest";

const generateLink = vi.fn();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ auth: { admin: { generateLink } } }),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

function req(body: unknown) {
  return new Request("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify(body) });
}

const VALID = { email: "ana@example.com", password: "Password1", name: "Ana Ruiz", language: "es" };

function created(token = "TOKENHASH") {
  generateLink.mockResolvedValue({
    data: { properties: { hashed_token: token }, user: { id: "user-1" } },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sendEmail.mockResolvedValue({});
});

describe("POST /api/auth/register", () => {
  it("rejects a bad email, a short password or a missing name", async () => {
    for (const body of [
      { ...VALID, email: "nope" },
      { ...VALID, password: "short" },
      { ...VALID, name: "" },
    ]) {
      expect((await POST(req(body))).status).toBe(400);
    }
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("creates the account with the language in its metadata", async () => {
    created();

    const res = await POST(req(VALID));

    expect(res.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "signup",
        email: "ana@example.com",
        password: "Password1",
        options: { data: { name: "Ana Ruiz", communication_language: "es" } },
      }),
    );
  });

  it("sends our own confirmation email, in the language asked for", async () => {
    // The whole point. GoTrue's template cannot read a language, so this
    // email is ours: our sender, our template, their language.
    created();

    await POST(req(VALID));

    const sent = sendEmail.mock.calls[0][0];
    expect(sent.to).toBe("ana@example.com");
    expect(sent.subject).toBe("Confirme su cuenta de BillFixr");
    expect(String(sent.html)).toContain("Confirmar cuenta");
    expect(String(sent.html)).toContain('<html lang="es">');
  });

  it("puts the real confirmation token in the link", async () => {
    // A confirmation email whose link does not work is worse than none.
    created("abc123");

    await POST(req(VALID));

    expect(String(sendEmail.mock.calls[0][0].html)).toContain("token_hash=abc123");
    expect(String(sendEmail.mock.calls[0][0].html)).toContain("type=signup");
  });

  it("writes English to someone who registered in English", async () => {
    created();

    await POST(req({ ...VALID, language: "en" }));

    expect(sendEmail.mock.calls[0][0].subject).toBe("Confirm your BillFixr account");
  });

  it("does not reveal that an address is already a confirmed account", async () => {
    // Supabase refuses with 422 for a confirmed user. Answering
    // differently here would make this route a way of asking who has an
    // account, so it answers exactly as it does on success -- and sends
    // nothing.
    generateLink.mockResolvedValue({ data: null, error: { status: 422, message: "User already registered" } });

    const res = await POST(req(VALID));

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ confirmationSent: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("passes a database rejection back so the form can explain it", async () => {
    // The disposable-domain trigger surfaces this way, and the form
    // turns it into its own message.
    generateLink.mockResolvedValue({
      data: null,
      error: { status: 500, message: "Database error creating new user" },
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(req(VALID));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Database error/);
  });

  it("still reports success when the email cannot be sent", async () => {
    // The account exists either way. Failing here would leave someone
    // with an account and no way to ask for the link again.
    vi.spyOn(console, "error").mockImplementation(() => {});
    created();
    sendEmail.mockRejectedValue(new Error("resend down"));

    expect((await POST(req(VALID))).status).toBe(200);
  });
});
