import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

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

  it("subscribes a new email", async () => {
    serverMock.queueResult("newsletter_subscribers", { data: null, error: null });

    const res = await POST(makeRequest({ email: "reader@example.org" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(serverMock.from).toHaveBeenCalledWith("newsletter_subscribers");
  });

  it("treats an already-subscribed email as success", async () => {
    serverMock.queueResult("newsletter_subscribers", {
      data: null,
      error: { message: "duplicate key value violates unique constraint", code: "23505" },
    });

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
