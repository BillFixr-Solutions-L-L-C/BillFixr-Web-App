import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const adminMock = createSupabaseMock();
const sendEmail = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => adminMock.client),
}));
vi.mock("@/lib/email", () => ({ sendEmail }));

const { GET } = await import("./route");

function makeRequest(secret?: string) {
  return new Request("http://localhost/api/cron/follow-ups", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

const REAL_SECRET = "test-cron-secret";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRON_SECRET", REAL_SECRET);
});

describe("GET /api/cron/follow-ups", () => {
  it("rejects a request with no bearer token", async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("rejects a request with the wrong secret", async () => {
    const res = await GET(makeRequest("wrong-secret"));
    expect(res.status).toBe(401);
  });

  it("sends nothing and reports zero processed when no follow-ups are due", async () => {
    adminMock.queueResult("follow_ups", { data: [], error: null });
    const res = await GET(makeRequest(REAL_SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, sent: 0 });
  });

  it("sends an email for each due follow-up and marks it sent", async () => {
    adminMock.queueResult("follow_ups", {
      data: [
        {
          id: "fu-1",
          cases: { bills: { filename: "hospital-bill.pdf" }, profiles: { name: "Jane Doe", email: "jane@example.com" } },
        },
      ],
      error: null,
    });
    sendEmail.mockResolvedValue({ id: "email-1" });
    adminMock.queueResult("follow_ups", { data: null, error: null }); // the .update({sent:true}) call

    const res = await GET(makeRequest(REAL_SECRET));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 1, sent: 1 });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "jane@example.com", subject: expect.stringContaining("BillFixr") }),
    );
  });

  it("skips a follow-up whose case has no profile email, without crashing", async () => {
    adminMock.queueResult("follow_ups", {
      data: [{ id: "fu-1", cases: { bills: null, profiles: null } }],
      error: null,
    });

    const res = await GET(makeRequest(REAL_SECRET));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 1, sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("leaves sent=false and keeps going when an individual send throws", async () => {
    adminMock.queueResult("follow_ups", {
      data: [
        { id: "fu-1", cases: { bills: null, profiles: { name: "A", email: "a@example.com" } } },
        { id: "fu-2", cases: { bills: null, profiles: { name: "B", email: "b@example.com" } } },
      ],
      error: null,
    });
    sendEmail.mockRejectedValueOnce(new Error("resend down")).mockResolvedValueOnce({ id: "email-2" });
    adminMock.queueResult("follow_ups", { data: null, error: null });

    const res = await GET(makeRequest(REAL_SECRET));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 2, sent: 1 });
  });
});
