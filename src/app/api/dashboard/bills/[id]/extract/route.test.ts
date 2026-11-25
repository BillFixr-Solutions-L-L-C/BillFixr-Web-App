import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const extractBill = vi.fn();
const wakeAutomationEngine = vi.fn();
const getAutomationEngineConfig = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
// importOriginal so AutomationEngineTimeoutError is the real class — the
// route's `instanceof` check decides between a 504 and a 502, and a stubbed
// class would make that branch untestable.
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  extractBill: (...a: unknown[]) => extractBill(...a),
  getAutomationEngineConfig: () => getAutomationEngineConfig(),
  // Asked before the engine is used: on a free tier it sleeps, and a cold
  // start costs more than the whole request budget.
  wakeAutomationEngine: () => wakeAutomationEngine(),
}));

const { POST } = await import("./route");
const { AutomationEngineError, AutomationEngineTimeoutError } = await import("@/lib/automation-engine");

const params = Promise.resolve({ id: "bill-1" });
const USER = { id: "user-1" };
const BILL: Record<string, string | null> = {
  id: "bill-1",
  user_id: USER.id,
  filename: "bill.pdf",
  storage_url: "user-1/bill.pdf",
  provider_name: null,
  provider_email: null,
  provider_phone: null,
  provider_address: null,
  service_date: null,
  statement_date: null,
};

// The engine's own flat shape, from POST /api/extract. The line items and
// their CPT codes are the part that must never reach the customer before
// the commitment fee is paid.
const ENGINE_RESULT = {
  provider_name: "Riverside General",
  provider_address: "2 Care Rd",
  provider_phone: "555-0100",
  provider_email: "billing@riverside.com",
  patient_name: "Jordan Patient",
  patient_address: "9 Patient Way",
  account_number: "ACC-77",
  statement_date: "2026-07-20",
  date_of_service: "2026-07-14",
  is_itemized: true,
  total_billed: 4200,
  insurance_paid: 1000,
  patient_due: 3200,
  notes: "secret findings",
  line_items: [
    {
      line_id: "L1",
      date: "2026-07-14",
      cpt_code: "99285",
      revenue_code: "0450",
      description: "secret letter",
      quantity: 1,
      charge_amount: 4200,
      category: "Emergency Room",
    },
  ],
};

function req() {
  return new Request("http://localhost/x", { method: "POST" });
}

// The Supabase mock builds a fresh query builder per `.from(table)` call and
// does not expose its spies, so collect a given chain method's calls across
// every builder this route made.
function callsTo(method: string): unknown[][] {
  return adminMock.from.mock.results.flatMap((result) => {
    const builder = result.value as Record<string, { mock?: { calls: unknown[][] } }>;
    return builder?.[method]?.mock?.calls ?? [];
  });
}

function ownsBill(bill = BILL) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("bills", { data: bill, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  // clearAllMocks only clears call history: an implementation set with
  // mockResolvedValue, and anything still queued by a ...Once, survives
  // into the next test. With the retry tests below that showed up as a
  // read being attempted three times in a test that queued two answers.
  extractBill.mockReset();
  // No real sleeping between retries: the backoff is 3s in production and
  // two of them outlast vitest's own timeout, and a test that times out
  // mid-retry leaves the loop calling extractBill into the next test.
  vi.stubEnv("AUTOMATION_ENGINE_RETRY_DELAY_MS", "0");
  getAutomationEngineConfig.mockReturnValue({ baseUrl: "http://engine" });
  // Awake unless a test says otherwise.
  wakeAutomationEngine.mockResolvedValue(true);
  adminMock.storageDownload.mockResolvedValue({ data: new Blob(["pdf"]), error: null });
});

describe("POST /api/dashboard/bills/[id]/extract", () => {
  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req(), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's bill and never reads the document", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: { ...BILL, user_id: "other" }, error: null });
    expect((await POST(req(), { params })).status).toBe(404);
    expect(extractBill).not.toHaveBeenCalled();
  });

  it("degrades gracefully when the engine isn't configured", async () => {
    getAutomationEngineConfig.mockReturnValue(null);
    ownsBill();
    const res = await POST(req(), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).fields).toBeNull();
  });

  it("reads the bill with the engine, not the ai-service", async () => {
    // The whole point of the change: /api/extract sends the page images to
    // a vision model, where the ai-service sent tesseract's text.
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockResolvedValue(ENGINE_RESULT);
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    await POST(req(), { params });

    expect(extractBill).toHaveBeenCalledTimes(1);
    const [arg] = extractBill.mock.calls[0] as [{ filename: string; bytes: Blob }];
    expect(arg.filename).toBe("bill.pdf");
    expect(arg.bytes).toBeInstanceOf(Blob);
  });

  it("returns only the identifying fields, never the charges or line items", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockResolvedValue(ENGINE_RESULT);
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.fields).toEqual({
      clientName: "Jordan Patient",
      address: "9 Patient Way",
      hospitalName: "Riverside General",
      billingManagerEmail: "billing@riverside.com",
      hospitalAddress: "2 Care Rd",
      // the bill carries one provider contact, so there's no separate
      // support address to offer; the hospital lookup fills this
      supportEmail: "",
      billingPhone: "555-0100",
    });
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("secret findings");
    expect(serialized).not.toContain("secret letter");
    expect(serialized).not.toContain("99285");
    expect(serialized).not.toContain("3200");
  });

  it("parks the full reading in engine_result for the audit to use later", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockResolvedValue(ENGINE_RESULT);
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    await POST(req(), { params });

    expect(callsTo("upsert")).toEqual([
      [{ bill_id: "bill-1", engine_result: ENGINE_RESULT }, { onConflict: "bill_id" }],
    ]);
  });

  it("reuses a cached engine reading instead of paying to read it twice", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: { engine_result: ENGINE_RESULT }, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect(extractBill).not.toHaveBeenCalled();
  });

  it("re-reads a bill that only has the old ai-service reading", async () => {
    // Those rows are the blank-form case this route was changed to fix, so
    // serving one again would hand back the same empty answer forever.
    ownsBill();
    adminMock.queueResult("bill_extractions", {
      data: { engine_result: null, result: { processed_documents: [{ extraction: {} }] } },
      error: null,
    });
    extractBill.mockResolvedValue(ENGINE_RESULT);
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const body = await (await POST(req(), { params })).json();

    expect(extractBill).toHaveBeenCalledTimes(1);
    expect(body.fields.hospitalName).toBe("Riverside General");
  });

  it("does not overwrite details the customer already entered", async () => {
    ownsBill({ ...BILL, provider_name: "Typed By Customer" });
    adminMock.queueResult("bill_extractions", { data: { engine_result: ENGINE_RESULT }, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const body = await (await POST(req(), { params })).json();

    expect(body.fields.hospitalName).toBe("Typed By Customer");
  });

  it("treats the prompt's own placeholders as nothing found", async () => {
    // The engine describes its JSON shape in a prompt rather than enforcing
    // it, so a model that found nothing echoes the placeholder back. Before
    // this the form filled in a hospital literally called "string".
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockResolvedValue({
      ...ENGINE_RESULT,
      provider_name: "string",
      provider_email: "  ",
      patient_address: "N/A",
      date_of_service: "YYYY-MM-DD",
    });
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const body = await (await POST(req(), { params })).json();

    expect(body.fields.hospitalName).toBe("");
    expect(body.fields.billingManagerEmail).toBe("");
    expect(body.fields.address).toBe("");
    // and nothing unreadable is written to the bill either
    expect(callsTo("update")).toEqual([
      [expect.objectContaining({ provider_name: null, service_date: null })],
    ]);
  });

  it("says try again on a timeout, and does not on a refusal", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockRejectedValue(new AutomationEngineTimeoutError("/api/extract", 1000));
    const res = await POST(req(), { params });
    const body = await res.json();

    expect(res.status).toBe(504);
    expect(body.stage).toBe("extract_timeout");
    expect(body.error).toContain("try again");
    // The message must not carry the upstream text, which can name hosts.
    expect(body.error).not.toContain("/api/extract");
  });

  it("reports a document it cannot read", async () => {
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockRejectedValue(new Error("engine down"));
    const res = await POST(req(), { params });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.fields).toBeNull();
    expect(body.stage).toBe("extract_failed");
    expect(body.error).not.toContain("engine down");
  });

  it("does not cache a 200 that carries no reading", async () => {
    // Caching an empty answer would serve it back forever without ever
    // re-reading the document.
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockResolvedValue({});

    const res = await POST(req(), { params });

    expect(res.status).toBe(502);
    expect((await res.json()).stage).toBe("extract_empty");
    expect(callsTo("upsert")).toEqual([]);
  });

  it("still returns the fields when caching the reading fails", async () => {
    // Paying to read it again is not a reason to fail the customer's step.
    ownsBill();
    adminMock.queueResult("bill_extractions", { data: null, error: null });
    extractBill.mockResolvedValue(ENGINE_RESULT);
    adminMock.queueResult("bill_extractions", { data: null, error: { message: "disk full" } });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req(), { params });

    expect(res.status).toBe(200);
    expect((await res.json()).fields.hospitalName).toBe("Riverside General");
  });
});

// The engine runs on a free tier that spins down when idle.
//
// Measured on 2026-11-24: a warm read is 22s direct and 44s through this
// route, against a platform ceiling of 60. A cold start on top of that is
// over the line, and the platform kills the request before any timeout
// here can answer -- so the information step saw a dead response, gave
// up, and left every box blank. That is what a customer reported on
// 2026-11-22.
describe("when the engine is asleep", () => {
  function ownedBill() {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("bills", {
      data: { id: "bill-1", user_id: "user-1", filename: "bill.pdf", storage_url: "user-1/bill.pdf" },
      error: null,
    });
    adminMock.queueResult("bill_extractions", { data: null, error: null });
  }

  it("asks whether it is awake before trying to read", async () => {
    ownedBill();
    extractBill.mockResolvedValue({ provider_name: "Matthew Walker", patient_due: 428.53 });

    await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });

    expect(wakeAutomationEngine).toHaveBeenCalled();
  });

  it("comes back later instead of spending the whole budget waiting", async () => {
    ownedBill();
    wakeAutomationEngine.mockResolvedValue(false);

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    // The stage is what the information step keys its retry on. Any other
    // failure is not worth waiting twelve seconds for.
    expect(body.stage).toBe("engine_waking");
    expect(extractBill).not.toHaveBeenCalled();
  });


  // The host in front of the engine sheds a request with a 503 and an
  // empty body when its single free-tier worker is already reading. About
  // one read in five, measured against production on 2026-11-25. This
  // route used to report that as "We couldn't read this document" and the
  // information step gave up -- the intermittent blank form.
  it("retries a read the engine shed rather than blaming the document", async () => {
    ownedBill();
    const shed = new AutomationEngineError("busy", 503, "");
    extractBill
      .mockRejectedValueOnce(shed)
      .mockResolvedValue({ provider_name: "Matthew Walker", patient_due: 428.53 });

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });
    const body = await res.json();

    expect(extractBill).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
    expect(body.fields.hospitalName).toBe("Matthew Walker");
  });

  it("asks the customer to come back when the engine stays busy", async () => {
    ownedBill();
    extractBill.mockRejectedValue(new AutomationEngineError("busy", 503, ""));

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    // Retryable, and it must not claim the document is unreadable.
    expect(body.stage).toBe("engine_busy");
    expect(body.error).not.toContain("couldn't read");
  });

  it("retries a rate-limited read too", async () => {
    ownedBill();
    extractBill
      .mockRejectedValueOnce(new AutomationEngineError("slow down", 429, ""))
      .mockResolvedValue({ provider_name: "Matthew Walker", patient_due: 428.53 });

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });

    expect(extractBill).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  // The other half of the classification. A 400 is about the request or
  // the file, so sending it again wastes the customer's wait.
  it("does not retry a document the engine refused on its merits", async () => {
    ownedBill();
    extractBill.mockRejectedValue(new AutomationEngineError("bad file", 400, ""));

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });
    const body = await res.json();

    expect(extractBill).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(502);
    expect(body.stage).toBe("extract_failed");
  });

  it("does not retry a timeout", async () => {
    ownedBill();
    extractBill.mockRejectedValue(new AutomationEngineTimeoutError("/api/extract", 240_000));

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });
    const body = await res.json();

    expect(extractBill).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(504);
    expect(body.stage).toBe("extract_timeout");
  });

  it("does not wake anything for a bill it has already read", async () => {
    // The cached reading is the point: no engine, no cost, no wait.
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("bills", {
      data: { id: "bill-1", user_id: "user-1", filename: "bill.pdf", storage_url: "user-1/bill.pdf" },
      error: null,
    });
    adminMock.queueResult("bill_extractions", {
      data: { engine_result: { provider_name: "Matthew Walker", patient_due: 428.53 } },
      error: null,
    });

    const res = await POST(new Request("http://localhost/x", { method: "POST" }), {
      params: Promise.resolve({ id: "bill-1" }),
    });

    expect(res.status).toBe(200);
    expect(wakeAutomationEngine).not.toHaveBeenCalled();
    expect(extractBill).not.toHaveBeenCalled();
  });
});
