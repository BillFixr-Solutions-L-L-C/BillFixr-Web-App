import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

const USER = { id: "user-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/auth/welcome-email", () => {
  it("returns 401 when there is no authenticated user", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST();
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 404 when the profile doesn't exist", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", { data: null, error: null });
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("does not resend when welcome_email_sent_at is already set", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", {
      data: { name: "Jane", email: "jane@example.com", welcome_email_sent_at: "2026-08-29T00:00:00Z" },
      error: null,
    });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadySent: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends the welcome email and marks it sent on first call", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", {
      data: { name: "Jane", email: "jane@example.com", welcome_email_sent_at: null },
      error: null,
    });
    sendEmail.mockResolvedValue({ id: "email-1" });
    serverMock.queueResult("profiles", { data: null, error: null });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com", subject: "Welcome to BillFixr" }),
    );
  });

  it("returns 500 without setting the flag when the send fails", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("profiles", {
      data: { name: "Jane", email: "jane@example.com", welcome_email_sent_at: null },
      error: null,
    });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST();

    expect(res.status).toBe(500);
  });
});

// The first email a customer ever gets, in the language they registered
// in.
//
// The route read communication_language from the start and the four
// "how it works" steps were translated -- but two whole sections, the
// button and the sign-off were English literals in the template, so a
// Spanish registrant opened a Spanish email and found the fee
// explanation in English. That is the one paragraph in it that costs
// money to misunderstand.
describe("the language the welcome email is written in", () => {
  function profileIn(language: string | null) {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", {
      data: { name: "Ana", email: "ana@example.com", welcome_email_sent_at: null, communication_language: language },
      error: null,
    });
  }

  function sent() {
    return sendEmail.mock.calls[0][0];
  }

  it("writes the whole email in Spanish, not just the opening", async () => {
    profileIn("es");

    await POST();

    const html = String(sent().html);
    expect(sent().subject).toBe("Bienvenido a BillFixr");
    // The steps were already translated.
    expect(html).toContain("Suba su factura");
    // These were not.
    expect(html).toContain("Lo que cuesta");
    expect(html).toContain("Sus documentos son privados");
    expect(html).toContain("pestaña Soporte");
    expect(html).toContain("Todos los derechos reservados");
  });

  it("states the success fee against the saving, in Spanish too", async () => {
    // docs/FEES.md: a percentage of what the customer saves, never of
    // the corrected bill. The Spanish has to say the same thing.
    profileIn("es");

    await POST();

    expect(String(sent().html)).toContain("un porcentaje de lo que usted ahorra");
  });

  it("leaves no English prose behind in the Spanish version", async () => {
    profileIn("es");

    await POST();

    const html = String(sent().html);
    for (const english of [
      "What it costs",
      "Your documents are private",
      "Upload Your First Bill",
      "Reach us anytime",
      "All Rights Reserved",
    ]) {
      expect(html, english).not.toContain(english);
    }
  });

  it("marks the document as Spanish", async () => {
    profileIn("es");

    await POST();

    expect(String(sent().html)).toContain('<html lang="es">');
  });

  it("still writes English to a customer who registered in English", async () => {
    profileIn("en");

    await POST();

    expect(sent().subject).toBe("Welcome to BillFixr");
    expect(String(sent().html)).toContain("What it costs");
  });

  it("falls back to English for a profile recorded before the column existed", async () => {
    profileIn(null);

    await POST();

    expect(sent().subject).toBe("Welcome to BillFixr");
  });
});
