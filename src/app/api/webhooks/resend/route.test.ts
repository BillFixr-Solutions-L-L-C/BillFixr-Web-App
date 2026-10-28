import crypto from "crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));

const { POST } = await import("./route");

const SECRET = "whsec_" + Buffer.from("letter-tracking-test-secret").toString("base64");
const CASE_ID = "11111111-1111-1111-1111-111111111111";

// Signs exactly the way Svix does, so these tests exercise the real
// verification rather than a stubbed-out one: a change that weakens the
// HMAC fails here instead of silently accepting forged events.
function sign(body: string, id: string, timestamp: number, secret = SECRET) {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

function makeRequest({
  body,
  id = "msg_1",
  timestamp = Math.floor(Date.now() / 1000),
  signature,
}: {
  body: string;
  id?: string;
  timestamp?: number;
  signature?: string | null;
}) {
  const headers: Record<string, string> = {
    "svix-id": id,
    "svix-timestamp": String(timestamp),
  };
  if (signature !== null) {
    headers["svix-signature"] = signature ?? `v1,${sign(body, id, timestamp)}`;
  }
  return new Request("http://localhost/api/webhooks/resend", { method: "POST", headers, body });
}

const event = (type: string, emailId: string | null = "email_abc") =>
  JSON.stringify({
    type,
    created_at: "2026-10-28T10:00:00Z",
    data: emailId === null ? {} : { email_id: emailId },
  });

function queueMatchingCase() {
  adminMock.queueResult("cases", { data: { id: CASE_ID }, error: null });
}

const otherSecret = (phrase: string) => "whsec_" + Buffer.from(phrase).toString("base64");

beforeEach(() => {
  vi.clearAllMocks();
  adminMock.reset();
  process.env.RESEND_WEBHOOK_SECRET = SECRET;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.RESEND_WEBHOOK_SECRET;
});

describe("POST /api/webhooks/resend", () => {
  it("says it is unconfigured rather than accepting the event", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const res = await POST(makeRequest({ body: event("email.opened") }));

    // 503, not 200: an accepted event Resend stops retrying is a lost
    // event, and not 400 either, since nothing is wrong with the request.
    expect(res.status).toBe(503);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("rejects a request with no signature headers", async () => {
    const res = await POST(makeRequest({ body: event("email.opened"), signature: null }));

    expect(res.status).toBe(400);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("rejects a signature made with the wrong secret", async () => {
    const body = event("email.opened");
    const timestamp = Math.floor(Date.now() / 1000);
    const forged = `v1,${sign(body, "msg_1", timestamp, otherSecret("not-our-secret"))}`;

    const res = await POST(makeRequest({ body, timestamp, signature: forged }));

    expect(res.status).toBe(400);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("rejects a valid signature replayed over a different body", async () => {
    // The signature covers the raw body, so lifting one from a genuine
    // delivery and swapping the payload must not verify.
    const timestamp = Math.floor(Date.now() / 1000);
    const stolen = `v1,${sign(event("email.delivered"), "msg_1", timestamp)}`;

    const res = await POST(makeRequest({ body: event("email.opened"), timestamp, signature: stolen }));

    expect(res.status).toBe(400);
  });

  it("rejects a correctly signed event that is too old to be live", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 6 * 60;

    const res = await POST(makeRequest({ body: event("email.opened"), timestamp }));

    expect(res.status).toBe(400);
  });

  it("rejects a timestamp from the future by the same margin", async () => {
    const timestamp = Math.floor(Date.now() / 1000) + 6 * 60;

    const res = await POST(makeRequest({ body: event("email.opened"), timestamp }));

    expect(res.status).toBe(400);
  });

  it("does not throw on a malformed signature of the wrong length", async () => {
    // timingSafeEqual throws unless the buffers match in length, so a
    // garbage header has to be a clean 400 rather than a 500.
    const res = await POST(makeRequest({ body: event("email.opened"), signature: "v1,short" }));

    expect(res.status).toBe(400);
  });

  it("ignores an unknown signature scheme", async () => {
    const body = event("email.opened");
    const timestamp = Math.floor(Date.now() / 1000);

    const res = await POST(makeRequest({ body, timestamp, signature: `v2,${sign(body, "msg_1", timestamp)}` }));

    expect(res.status).toBe(400);
  });

  it("accepts when one of several signatures matches, so a secret can rotate", async () => {
    const body = event("email.opened");
    const timestamp = Math.floor(Date.now() / 1000);
    const previous = sign(body, "msg_1", timestamp, otherSecret("previous-secret"));
    const current = sign(body, "msg_1", timestamp);
    queueMatchingCase();
    adminMock.queueResult("letter_events", { data: null, error: null });

    const res = await POST(
      makeRequest({ body, timestamp, signature: `v1,${previous} v1,${current}` }),
    );

    expect(res.status).toBe(200);
  });

  it("rejects a payload that is not JSON", async () => {
    const res = await POST(makeRequest({ body: "not json" }));

    expect(res.status).toBe(400);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("accepts an event type it does not track without looking for a case", async () => {
    const res = await POST(makeRequest({ body: event("contact.created") }));

    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("accepts a tracked event carrying no email id", async () => {
    const res = await POST(makeRequest({ body: event("email.opened", null) }));

    expect(await res.json()).toEqual({ ok: true, ignored: true });
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("accepts an email that belongs to no case", async () => {
    // Every email BillFixr sends reaches this endpoint, not just appeal
    // letters, so an unmatched message is ordinary: record nothing, and
    // don't ask for a retry.
    adminMock.queueResult("cases", { data: null, error: null });

    const res = await POST(makeRequest({ body: event("email.opened") }));

    expect(await res.json()).toEqual({ ok: true, unmatched: true });
    expect(adminMock.from).toHaveBeenCalledTimes(1);
  });

  it("records a matched open keyed on the delivery id", async () => {
    queueMatchingCase();
    adminMock.queueResult("letter_events", { data: null, error: null });

    const res = await POST(makeRequest({ body: event("email.opened"), id: "msg_open_1" }));

    expect(await res.json()).toEqual({ ok: true });
    const upsert = adminMock.from.mock.results[1].value.upsert;
    expect(upsert).toHaveBeenCalledWith(
      {
        id: "msg_open_1",
        case_id: CASE_ID,
        message_id: "email_abc",
        type: "email.opened",
        occurred_at: "2026-10-28T10:00:00Z",
      },
      // Keyed on Svix's id and ignoring duplicates: Resend redelivers, and
      // the open count is a row count, so a redelivery must not inflate it.
      { onConflict: "id", ignoreDuplicates: true },
    );
  });

  it("falls back to the current time when the event carries no timestamp", async () => {
    queueMatchingCase();
    adminMock.queueResult("letter_events", { data: null, error: null });
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "email_abc" } });

    await POST(makeRequest({ body }));

    const upsert = adminMock.from.mock.results[1].value.upsert;
    expect(upsert.mock.calls[0][0].occurred_at).toEqual(expect.any(String));
  });

  it.each([
    "email.sent",
    "email.delivered",
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained",
  ])("records %s", async (type) => {
    queueMatchingCase();
    adminMock.queueResult("letter_events", { data: null, error: null });

    const res = await POST(makeRequest({ body: event(type) }));

    expect(await res.json()).toEqual({ ok: true });
  });

  it("asks for a retry when the event cannot be stored", async () => {
    queueMatchingCase();
    adminMock.queueResult("letter_events", { data: null, error: { message: "connection reset" } });

    const res = await POST(makeRequest({ body: event("email.opened") }));

    // Losing the event silently would under-report opens forever.
    expect(res.status).toBe(500);
  });
});
