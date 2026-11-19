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

// An applicant has no profile either, so the careers page's own language
// is what the acknowledgement is written in.
describe("the language the acknowledgement is written in", () => {
  function apply(language?: string) {
    serverMock.queueResult("job_applications", { data: null, error: null });
    serverMock.queueResult("job_postings", { data: { title: "Support Specialist" }, error: null });
    return POST(makeRequest({ ...VALID_BODY, ...(language ? { language } : {}) }));
  }

  it("writes it in Spanish when the page was Spanish", async () => {
    await apply("es");

    const call = sendEmail.mock.calls[0][0];
    expect(call.subject).toBe("Recibimos su solicitud");
    expect(String(call.html)).toContain("Hola Jamie Rivera");
    expect(String(call.html)).toContain("gracias por postularse");
    expect(String(call.html)).toContain('<html lang="es">');
  });

  it("names the role inside the sentence, in either language", async () => {
    await apply("es");

    expect(String(sendEmail.mock.calls[0][0].html)).toContain("Support Specialist");
  });

  it("escapes the applicant's own name exactly once", async () => {
    // Escaping the values and then the whole sentence again would show
    // someone their own name as &amp;.
    serverMock.queueResult("job_applications", { data: null, error: null });
    serverMock.queueResult("job_postings", { data: { title: "Billing & Appeals Lead" }, error: null });

    await POST(makeRequest({ ...VALID_BODY, fullName: "Ana & Co", language: "es" }));

    const html = String(sendEmail.mock.calls[0][0].html);
    expect(html).toContain("Ana &amp; Co");
    expect(html).not.toContain("Ana &amp;amp; Co");
    expect(html).toContain("Billing &amp; Appeals Lead");
  });

  it("writes it in English when the page was English", async () => {
    await apply("en");

    expect(sendEmail.mock.calls[0][0].subject).toBe("We received your application");
  });

  it("falls back to English when the form sends nothing", async () => {
    await apply();

    expect(sendEmail.mock.calls[0][0].subject).toBe("We received your application");
  });
});
