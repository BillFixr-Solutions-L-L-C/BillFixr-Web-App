import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();
const adminMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => serverMock.client) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => adminMock.client) }));

const { PATCH } = await import("./route");

const params = Promise.resolve({ id: "bill-1" });
const USER = { id: "user-1" };
const VALID = {
  clientName: "Jane Doe",
  address: "1 Main St",
  clientHospitalNumber: "45962",
  hospitalName: "General Hospital",
  billingManagerEmail: "billing@hospital.com",
  hospitalAddress: "2 Care Rd",
  supportEmail: "support@hospital.com",
  billingPhone: "555-0100",
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/dashboard/bills/bill-1/information", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function ownsBill() {
  serverMock.getUser.mockResolvedValue({ data: { user: USER } });
  serverMock.queueResult("bills", { data: { id: "bill-1", user_id: USER.id }, error: null });
}

function updateArg(mock: ReturnType<typeof createSupabaseMock>, call = 0) {
  const builder = mock.from.mock.results[call].value as { update: ReturnType<typeof vi.fn> };
  return builder.update.mock.calls[0][0];
}

beforeEach(() => {
  vi.clearAllMocks();
  serverMock.reset();
  adminMock.reset();
});

describe("PATCH /api/dashboard/bills/[id]/information", () => {
  it("rejects a non-string field and an over-long one", async () => {
    expect((await PATCH(makeRequest({ ...VALID, hospitalName: 5 }), { params })).status).toBe(400);
    expect((await PATCH(makeRequest({ ...VALID, clientName: "a".repeat(201) }), { params })).status).toBe(400);
  });

  it("rejects a malformed billing manager email", async () => {
    const res = await PATCH(makeRequest({ ...VALID, billingManagerEmail: "nope" }), { params });
    expect(res.status).toBe(400);
  });

  it("requires a client name", async () => {
    const res = await PATCH(makeRequest({ ...VALID, clientName: "   " }), { params });
    expect(res.status).toBe(400);
  });

  it("returns 401 without a session", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    expect((await PATCH(makeRequest(VALID), { params })).status).toBe(401);
  });

  it("returns 404 for someone else's bill and writes nothing", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: USER } });
    serverMock.queueResult("bills", { data: { id: "bill-1", user_id: "other" }, error: null });
    expect((await PATCH(makeRequest(VALID), { params })).status).toBe(404);
    expect(adminMock.from).not.toHaveBeenCalled();
  });

  it("saves personal fields to the profile and hospital fields to the bill", async () => {
    ownsBill();
    serverMock.queueResult("profiles", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    const res = await PATCH(makeRequest(VALID), { params });

    expect(res.status).toBe(200);
    // from() call 0 is the ownership select on bills, call 1 is the profile update
    expect(updateArg(serverMock, 1)).toEqual({
      name: "Jane Doe",
      address: "1 Main St",
      client_hospital_number: "45962",
    });
    expect(updateArg(adminMock)).toEqual({
      provider_name: "General Hospital",
      provider_email: "billing@hospital.com",
      provider_address: "2 Care Rd",
      provider_support_email: "support@hospital.com",
      provider_phone: "555-0100",
    });
  });

  it("stores blank optional fields as null rather than empty strings", async () => {
    ownsBill();
    serverMock.queueResult("profiles", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: null });

    await PATCH(
      makeRequest({ ...VALID, hospitalName: "", billingManagerEmail: "", billingPhone: "  ", clientHospitalNumber: "" }),
      { params },
    );

    expect(updateArg(adminMock)).toMatchObject({
      provider_name: null,
      provider_email: null,
      provider_phone: null,
    });
    expect(updateArg(serverMock, 1)).toMatchObject({ client_hospital_number: null });
  });

  it("returns 500 when the bill write fails", async () => {
    ownsBill();
    serverMock.queueResult("profiles", { data: null, error: null });
    adminMock.queueResult("bills", { data: null, error: { message: "db down" } });
    expect((await PATCH(makeRequest(VALID), { params })).status).toBe(500);
  });
});
