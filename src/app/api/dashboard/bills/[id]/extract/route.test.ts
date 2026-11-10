import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const extractBill = vi.fn();
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
}));

const { POST } = await import("./route");
const { AutomationEngineTimeoutError } = await import("@/lib/automation-engine");

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
  getAutomationEngineConfig.mockReturnValue({ baseUrl: "http://engine" });
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
