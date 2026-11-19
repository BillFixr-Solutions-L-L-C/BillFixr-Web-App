import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { PATCH } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/support-tickets/ticket-1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

const params = Promise.resolve({ id: "ticket-1" });

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.rpc.mockResolvedValue({ data: "full", error: null });
});

describe("PATCH /api/admin/support-tickets/[id]", () => {
  it("rejects an invalid status", async () => {
    const res = await PATCH(makeRequest({ status: "open" }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(makeRequest({ status: "resolved" }), { params });
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await PATCH(makeRequest({ status: "resolved" }), { params });
    expect(res.status).toBe(403);
  });

  it("returns 403 when the caller lacks full client_data domain access", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.rpc.mockResolvedValue({ data: "read_only", error: null });

    const res = await PATCH(makeRequest({ status: "resolved" }), { params });

    expect(res.status).toBe(403);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("returns 500 on a database error", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", { data: null, error: { message: "connection refused" } });

    const res = await PATCH(makeRequest({ status: "resolved" }), { params });

    expect(res.status).toBe(500);
  });

  it("updates the status and emails the customer for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", {
      data: { subject: "Payment issue", profiles: { name: "Jane", email: "jane@example.com" } },
      error: null,
    });

    const res = await PATCH(makeRequest({ status: "resolved" }), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledWith(
      // Repliable: these carry an agent's note, and the From address is
      // notifications@, which is not where a reply should land.
      expect.objectContaining({ to: "jane@example.com", replyTo: "support@billfixr.com" }),
    );
  });

  it("uses the admin's custom note as the resolution email body when provided", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", {
      data: { subject: "Payment issue", profiles: { name: "Jane", email: "jane@example.com" } },
      error: null,
    });

    const res = await PATCH(
      makeRequest({ status: "resolved", note: "We refunded the duplicate charge." }),
      { params },
    );

    expect(res.status).toBe(200);
    const [emailCall] = sendEmail.mock.calls[0];
    expect(emailCall.html).toContain("We refunded the duplicate charge.");
  });

  it("rejects a non-string note", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });

    const res = await PATCH(makeRequest({ status: "resolved", note: 123 }), { params });

    expect(res.status).toBe(400);
  });

  it("still returns ok when the notification email fails to send", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", {
      data: { subject: "Payment issue", profiles: { name: "Jane", email: "jane@example.com" } },
      error: null,
    });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await PATCH(makeRequest({ status: "in_progress" }), { params });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

// A customer who registered in Spanish is written to in Spanish.
//
// These two emails were English literals in the route handler, so they
// went out in English however the customer had registered -- the profile
// column was read correctly everywhere else and never read here. Nothing
// failed when that was true, which is why it survived.
describe("the language a ticket email is written in", () => {
  function ticketFor(language: string | null) {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("support_tickets", {
      data: {
        subject: "Problema de pago",
        profiles: { name: "Ana", email: "ana@example.com", communication_language: language },
      },
      error: null,
    });
  }

  function sentHtml(): string {
    return String(sendEmail.mock.calls[0][0].html);
  }

  it("writes the in-progress email in Spanish", async () => {
    ticketFor("es");

    await PATCH(makeRequest({ status: "in_progress" }), { params });

    expect(sendEmail.mock.calls[0][0].subject).toBe("Estamos revisando su solicitud de soporte");
    expect(sentHtml()).toContain("Hola Ana,");
    expect(sentHtml()).toContain("Un agente ha tomado su solicitud");
    expect(sentHtml()).not.toContain("An agent has picked up");
  });

  it("writes the resolved email in Spanish, naming the ticket", async () => {
    ticketFor("es");

    await PATCH(makeRequest({ status: "resolved" }), { params });

    expect(sendEmail.mock.calls[0][0].subject).toBe("Su solicitud de soporte se ha resuelto");
    expect(sentHtml()).toContain("Problema de pago");
    expect(sentHtml()).not.toContain("has been marked resolved");
  });

  it("marks the document as Spanish, not English", async () => {
    // A Spanish email claiming lang="en" is wrong for a screen reader and
    // for anything offering to translate it.
    ticketFor("es");

    await PATCH(makeRequest({ status: "resolved" }), { params });

    expect(sentHtml()).toContain('<html lang="es">');
  });

  it("still writes English to a customer who registered in English", async () => {
    ticketFor("en");

    await PATCH(makeRequest({ status: "in_progress" }), { params });

    expect(sendEmail.mock.calls[0][0].subject).toBe("We're looking into your support ticket");
    expect(sentHtml()).toContain("Hi Ana,");
  });

  it("falls back to English for a profile recorded before the column existed", async () => {
    ticketFor(null);

    await PATCH(makeRequest({ status: "in_progress" }), { params });

    expect(sendEmail.mock.calls[0][0].subject).toBe("We're looking into your support ticket");
  });

  it("sends an admin's own note as typed, not translated", async () => {
    // A human wrote those words to this person. Running them through a
    // dictionary would be worse than leaving them alone.
    ticketFor("es");

    await PATCH(makeRequest({ status: "resolved", note: "We refunded the $5 commitment fee." }), { params });

    expect(sentHtml()).toContain("We refunded the $5 commitment fee.");
    // The chrome around it is still Spanish.
    expect(sentHtml()).toContain("Hola Ana,");
  });
});
