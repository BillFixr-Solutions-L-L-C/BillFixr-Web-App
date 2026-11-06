import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();
const findProviderContact = vi.fn();
const getAiServiceConfig = vi.fn();
// The engine client, mocked separately. The seam prefers the engine when
// both are configured, and only the engine returns a postal address and a
// verification status, so a test about those has to come down this branch
// rather than ai-service's.
const engineContact = vi.fn();
const getAutomationEngineConfig = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));
vi.mock("@/lib/ai-service", () => ({
  findProviderContact: (...a: unknown[]) => findProviderContact(...a),
  getAiServiceConfig: () => getAiServiceConfig(),
}));
vi.mock("@/lib/automation-engine", () => ({
  findProviderContact: (...a: unknown[]) => engineContact(...a),
  getAutomationEngineConfig: () => getAutomationEngineConfig(),
  getEngineHealth: vi.fn(),
}));

const { POST } = await import("./route");

const params = Promise.resolve({ id: "bill-1" });
const USER = { id: "user-1" };
const BILL: Record<string, string | null> = {
  id: "bill-1",
  user_id: USER.id,
  provider_name: "Riverside General",
  provider_address: "2 Care Rd",
  provider_email: null,
  provider_support_email: null,
};

function req(body: unknown) {
  return new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
}
function owns(bill = BILL) {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("bills", { data: bill, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
  getAiServiceConfig.mockReturnValue({ baseUrl: "http://ai" });
  // Unconfigured by default, so the tests that predate the engine branch
  // keep going through ai-service as they always did.
  getAutomationEngineConfig.mockReturnValue(null);
});

describe("POST /api/dashboard/bills/[id]/find-contact", () => {
  it("rejects a field it doesn't look up", async () => {
    expect((await POST(req({ field: "hospitalName" }), { params })).status).toBe(400);
    expect((await POST(req({}), { params })).status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await POST(req({ field: "supportEmail" }), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's bill and never searches", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: { ...BILL, user_id: "other" }, error: null });
    expect((await POST(req({ field: "supportEmail" }), { params })).status).toBe(404);
    expect(findProviderContact).not.toHaveBeenCalled();
  });

  it("asks for the hospital name first, since that's what it searches on", async () => {
    owns({ ...BILL, provider_name: null });
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/hospital name first/i);
    expect(findProviderContact).not.toHaveBeenCalled();
  });

  it("searches on the name the customer just typed, before it's been saved", async () => {
    owns({ ...BILL, provider_name: null, provider_address: null });
    findProviderContact.mockResolvedValue({ billing_email: "b@r.com", support_email: null, phone: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(
      req({ field: "billingManagerEmail", hospitalName: "Typed Hospital", hospitalAddress: "9 New Rd" }),
      { params },
    );

    expect(res.status).toBe(200);
    expect(findProviderContact).toHaveBeenCalledWith({ name: "Typed Hospital", address: "9 New Rd" });
  });

  it("rejects an over-long search term", async () => {
    const res = await POST(req({ field: "billingManagerEmail", hospitalName: "a".repeat(201) }), { params });
    expect(res.status).toBe(400);
  });

  it("degrades gracefully when the AI isn't configured", async () => {
    getAiServiceConfig.mockReturnValue(null);
    owns();
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).value).toBeNull();
  });

  it("hands back the billing line when there is no email, instead of a dead end", async () => {
    // The normal outcome. Hospitals rarely publish a billing email, so the
    // response has to carry what was found or the customer has no way to
    // obtain the address the send requires.
    owns();
    findProviderContact.mockResolvedValue({
      billing_email: null,
      support_email: null,
      phone: "800-242-7416",
    });

    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.value).toBeNull();
    expect(body.fallback.phone).toBe("800-242-7416");
  });

  it("passes back the postal address for a hospital that publishes no email", async () => {
    // The federal NPI registry covers essentially every US provider but has
    // no email field, so a postal address and a phone number is the whole
    // answer for most hospitals. Dropping it here would report "nothing
    // found" while holding the hospital's actual billing address.
    owns();
    getAutomationEngineConfig.mockReturnValue({ baseUrl: "http://engine" });
    engineContact.mockResolvedValue({
      billing_email: null,
      support_email: null,
      phone: "615-396-4100",
      provider_name: "Ascension Saint Thomas Rutherford",
      mailing_address: "1700 MEDICAL CENTER PKWY, MURFREESBORO, TN 37129-2245",
      facility_type: "General Acute Care Hospital",
      npi: "1164590386",
      candidates: [],
    });

    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.value).toBeNull();
    expect(body.fallback.mailingAddress).toBe("1700 MEDICAL CENTER PKWY, MURFREESBORO, TN 37129-2245");
    expect(body.fallback.facilityType).toBe("General Acute Care Hospital");
    expect(body.fallback.npi).toBe("1164590386");
  });

  it("offers the other facilities that matched the name, without repeating the first", async () => {
    // One hospital registers several NPIs -- itself, its lab, its clinic --
    // at the same name and street. The customer has to be able to catch a
    // wrong pick before a dispute is posted to a laboratory.
    owns();
    getAutomationEngineConfig.mockReturnValue({ baseUrl: "http://engine" });
    engineContact.mockResolvedValue({
      billing_email: null,
      support_email: null,
      phone: "615-396-4100",
      provider_name: "Saint Thomas Rutherford Hospital",
      mailing_address: "1700 MEDICAL CENTER PKWY, MURFREESBORO, TN 37129-2245",
      npi: "1164590386",
      candidates: [
        { name: "Saint Thomas Rutherford Hospital", facility_type: "General Acute Care Hospital", mailing_address: "1700 MEDICAL CENTER PKWY", phone: "615-396-4100", city: "MURFREESBORO", state: "TN" },
        { name: "Saint Thomas Rutherford Hospital", facility_type: "Clinic/Center", mailing_address: "301 N UNIVERSITY ST", phone: "615-396-5004", city: "MURFREESBORO", state: "TN" },
        { name: "Saint Thomas Rutherford Hospital Lab", facility_type: "Clinical Medical Laboratory", mailing_address: "1700 MEDICAL CENTER PKWY", phone: "615-396-4599", city: "MURFREESBORO", state: "TN" },
      ],
    });

    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    const body = await res.json();

    expect(body.fallback.otherMatches).toHaveLength(2);
    expect(body.fallback.otherMatches[0].facilityType).toBe("Clinic/Center");
    expect(body.fallback.otherMatches[1].facilityType).toBe("Clinical Medical Laboratory");
  });

  it("returns the billing address it found and stores it", async () => {
    owns();
    findProviderContact.mockResolvedValue({ billing_email: "billing@riverside.com", support_email: "s@r.com", phone: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req({ field: "billingManagerEmail" }), { params });

    expect(res.status).toBe(200);
    expect((await res.json()).value).toBe("billing@riverside.com");
    expect(findProviderContact).toHaveBeenCalledWith({ name: "Riverside General", address: "2 Care Rd" });
    expect(adminMock.from).toHaveBeenCalledWith("bills");
  });

  it("returns the support address for the support field", async () => {
    owns();
    findProviderContact.mockResolvedValue({ billing_email: "b@r.com", support_email: "support@riverside.com", phone: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await POST(req({ field: "supportEmail" }), { params });

    expect((await res.json()).value).toBe("support@riverside.com");
  });

  it("does not overwrite an address the customer already entered", async () => {
    owns({ ...BILL, provider_email: "typed@customer.com" });
    findProviderContact.mockResolvedValue({ billing_email: "billing@riverside.com", support_email: null, phone: null });

    const res = await POST(req({ field: "billingManagerEmail" }), { params });

    expect(res.status).toBe(200);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("reports nothing found rather than erroring", async () => {
    owns();
    findProviderContact.mockResolvedValue({ billing_email: null, support_email: null, phone: null });
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).value).toBeNull();
  });

  it("reports a failed lookup as something the customer can type instead", async () => {
    owns();
    findProviderContact.mockRejectedValue(new Error("404 not implemented"));
    const res = await POST(req({ field: "billingManagerEmail" }), { params });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/type it in/i);
  });
});
