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
  return new Request("http://localhost/api/careers/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  jobId: "job-1",
  fullName: "Jamie Rivera",
  email: "jamie@example.org",
  phone: "555-0100",
  cvPath: "job-1/1690000000-resume.pdf",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/careers/apply", () => {
  it("rejects a request missing required fields", async () => {
    const res = await POST(makeRequest({ jobId: "job-1" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when the insert fails", async () => {
    serverMock.queueResult("job_applications", { data: null, error: { message: "db exploded" } });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(500);
  });

  it("records the application and sends a confirmation email", async () => {
    serverMock.queueResult("job_applications", { data: null, error: null });
    serverMock.queueResult("job_postings", { data: { title: "Support Specialist" }, error: null });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(serverMock.from).toHaveBeenCalledWith("job_applications");
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "jamie@example.org" }));
  });

  it("still succeeds when the confirmation email fails to send", async () => {
    serverMock.queueResult("job_applications", { data: null, error: null });
    serverMock.queueResult("job_postings", { data: { title: "Support Specialist" }, error: null });
    sendEmail.mockRejectedValue(new Error("resend down"));

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
