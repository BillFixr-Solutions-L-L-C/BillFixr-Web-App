import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const uploadHospitalReply = vi.fn();
const isBackendConfigured = vi.fn();
const getDomainAccess = vi.fn();
const syncCaseFromNegotiation = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/aiStack", () => ({ isBackendConfigured: (...a: unknown[]) => isBackendConfigured(...a) }));
vi.mock("@/lib/domainAccess", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/domainAccess")>()),
  getDomainAccess: (...a: unknown[]) => getDomainAccess(...a),
}));
vi.mock("@/lib/caseStatusSync", () => ({
  syncCaseFromNegotiation: (...a: unknown[]) => syncCaseFromNegotiation(...a),
}));
vi.mock("@/lib/automation-engine", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/automation-engine")>()),
  uploadHospitalReply: (...a: unknown[]) => uploadHospitalReply(...a),
}));

const { POST } = await import("./route");
const { AutomationEngineError } = await import("@/lib/automation-engine");

const params = Promise.resolve({ id: "case-1" });

// The FormData is handed over directly rather than serialised into a
// Request body. Round-tripping it through this environment's request
// parser loses both the filename and the byte length -- a File built here
// is not recognised as one by the parser -- so a test written that way
// would be asserting against the test environment rather than the route.
// What is under test is the route's handling of the parsed form.
function request(form: FormData) {
  return { formData: async () => form } as unknown as Request;
}

function withFile(bytes = 10, type = "application/pdf", name = "letter.pdf") {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(bytes)], name, { type }));
  return form;
}

function adminCaller({ role = "admin", access = "full", negotiationId = "neg-1" as string | null } = {}) {
  serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
  serverMock.queueResult("profiles", { data: { role }, error: null });
  getDomainAccess.mockResolvedValue(access);
  isBackendConfigured.mockReturnValue(true);
  serverMock.queueResult("cases", {
    data: { id: "case-1", user_id: "user-1", status: "awaiting_response", negotiation_id: negotiationId },
    error: null,
  });
  uploadHospitalReply.mockResolvedValue({ id: "neg-1", status: "REPLY_RECEIVED" });
  syncCaseFromNegotiation.mockResolvedValue({ changed: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Providers answer on headed paper and by fax, and some ring instead of
// writing. None of that reaches an IMAP poller, so before this route a
// reply on paper could not enter the system by any route at all — the
// case went on being chased and could be closed for non-response while
// the answer sat in somebody's email as a scan.
describe("POST /api/admin/cases/[id]/negotiation/reply", () => {
  it("hands a scanned letter to the engine", async () => {
    adminCaller();

    const res = await POST(request(withFile()), { params });

    expect(res.status).toBe(200);
    const [negotiationId, payload] = uploadHospitalReply.mock.calls[0];
    expect(negotiationId).toBe("neg-1");
    expect(payload.file.filename).toBe("letter.pdf");
  });

  it("accepts typed words with no file, for a reply given over the phone", async () => {
    adminCaller();
    const form = new FormData();
    form.append("text", "billing office agreed to adjust the account to $112.49");

    const res = await POST(request(form), { params });

    expect(res.status).toBe(200);
    expect(uploadHospitalReply.mock.calls[0][1]).toMatchObject({
      text: "billing office agreed to adjust the account to $112.49",
      file: undefined,
    });
  });

  it("refuses an empty submission rather than letting a placeholder be invented", async () => {
    // The engine used to substitute a fixed sentence for an unreadable
    // reply and analyse that, producing the same hardcoded answer every
    // time. Nothing may reach it without real content.
    adminCaller();

    const res = await POST(request(new FormData()), { params });

    expect(res.status).toBe(400);
    expect(uploadHospitalReply).not.toHaveBeenCalled();
  });

  it("refuses whitespace as if it were empty", async () => {
    adminCaller();
    const form = new FormData();
    form.append("text", "   \n  ");

    const res = await POST(request(form), { params });

    expect(res.status).toBe(400);
    expect(uploadHospitalReply).not.toHaveBeenCalled();
  });

  it("refuses a file type the vision model cannot read", async () => {
    adminCaller();

    const res = await POST(request(withFile(10, "application/zip", "reply.zip")), { params });

    expect(res.status).toBe(415);
    expect(uploadHospitalReply).not.toHaveBeenCalled();
  });

  it("refuses a file over 10MB", async () => {
    adminCaller();

    const res = await POST(request(withFile(11 * 1024 * 1024)), { params });

    expect(res.status).toBe(413);
    expect(uploadHospitalReply).not.toHaveBeenCalled();
  });

  it("passes on the engine saying it could not read the document", async () => {
    // Not reworded into a generic failure: "could not read the uploaded
    // document" is the one answer that tells the admin to send a better
    // scan.
    adminCaller();
    uploadHospitalReply.mockRejectedValue(
      new AutomationEngineError("Could not read the uploaded document: page 1 is blank", 502, "unreadable"),
    );

    const res = await POST(request(withFile()), { params });

    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/could not read the uploaded document/i);
  });

  it("advances the case, so the customer is told without waiting for the cron", async () => {
    adminCaller();

    await POST(request(withFile()), { params });

    expect(syncCaseFromNegotiation).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "case-1" }),
      expect.objectContaining({ status: "REPLY_RECEIVED" }),
    );
  });

  it("still reports success when the case could not be advanced", async () => {
    // The reply is recorded with the engine and cannot be redone.
    adminCaller();
    syncCaseFromNegotiation.mockRejectedValue(new Error("db down"));

    const res = await POST(request(withFile()), { params });

    expect(res.status).toBe(200);
  });

  it("refuses a case with no negotiation", async () => {
    adminCaller({ negotiationId: null });

    const res = await POST(request(withFile()), { params });

    expect(res.status).toBe(409);
    expect(uploadHospitalReply).not.toHaveBeenCalled();
  });

  it("refuses anyone without full access to the negotiation domain", async () => {
    adminCaller({ access: "read_only" });

    const res = await POST(request(withFile()), { params });

    expect(res.status).toBe(403);
    expect(uploadHospitalReply).not.toHaveBeenCalled();
  });

  it("refuses a caller who is not an admin", async () => {
    adminCaller({ role: "customer" });

    const res = await POST(request(withFile()), { params });

    expect(res.status).toBe(403);
    expect(uploadHospitalReply).not.toHaveBeenCalled();
  });
});
