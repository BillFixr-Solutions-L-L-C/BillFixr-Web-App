import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/newsletter/subscribe", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/newsletter/subscribe", () => {
  it("rejects a missing email", async () => {
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("rejects a malformed email", async () => {
    const res = await POST(makeRequest({ email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("subscribes a new email and sends a confirmation", async () => {
    serverMock.queueResult("newsletter_subscribers", { data: null, error: null });

    const res = await POST(makeRequest({ email: "reader@example.org" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(serverMock.from).toHaveBeenCalledWith("newsletter_subscribers");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "reader@example.org" }));
  });

  it("treats an already-subscribed email as success without re-sending", async () => {
    serverMock.queueResult("newsletter_subscribers", {
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" },
    });

    const res = await POST(makeRequest({ email: "reader@example.org" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still subscribes even when the confirmation email fails to send", async () => {
    serverMock.queueResult("newsletter_subscribers", { data: null, error: null });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST(makeRequest({ email: "reader@example.org" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("returns 500 on an unexpected database error", async () => {
    serverMock.queueResult("newsletter_subscribers", {
      data: null,
      error: { message: "connection refused" },
    });

    const res = await POST(makeRequest({ email: "reader@example.org" }));

    expect(res.status).toBe(500);
  });
});

// A subscriber has no profile, so there is no communication_language to
// read. The form sends the language the site was being read in instead.
describe("the language the confirmation is written in", () => {
  function subscribe(language?: string) {
    serverMock.queueResult("newsletter_subscribers", { data: null, error: null });
    return POST(
      new Request("http://localhost/api/newsletter/subscribe", {
        method: "POST",
        body: JSON.stringify({ email: "ana@example.com", ...(language ? { language } : {}) }),
      }),
    );
  }

  it("writes it in Spanish when the page was Spanish", async () => {
    await subscribe("es");

    const call = sendEmail.mock.calls[0][0];
    expect(call.subject).toBe("Se suscribió a BillFixr");
    expect(String(call.html)).toContain("Gracias por suscribirse");
    expect(String(call.html)).toContain('<html lang="es">');
  });

  it("writes it in English when the page was English", async () => {
    await subscribe("en");

    expect(sendEmail.mock.calls[0][0].subject).toBe("You're subscribed to BillFixr");
  });

  it("falls back to English when the form sends nothing", async () => {
    // An older cached page, or a request made by hand.
    await subscribe();

    expect(sendEmail.mock.calls[0][0].subject).toBe("You're subscribed to BillFixr");
  });

  it("falls back to English for a language we do not have", async () => {
    await subscribe("fr");

    expect(sendEmail.mock.calls[0][0].subject).toBe("You're subscribed to BillFixr");
  });
});
