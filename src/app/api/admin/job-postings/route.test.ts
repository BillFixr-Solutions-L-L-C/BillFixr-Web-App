import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => serverMock.client),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/admin/job-postings", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

const VALID_BODY = {
  title: "DevOps Engineer",
  location: "Remote | Full Time",
  listingDescription: "Overview...",
  responsibilities: ["Build things"],
  requirements: ["Experience"],
  benefit: "Remote Work HMO",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/job-postings", () => {
  it("rejects an invalid body", async () => {
    const res = await POST(makeRequest({ title: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when there is no authenticated caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it("creates a posting for an admin caller", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    serverMock.queueResult("job_postings", { data: { id: "posting-1" }, error: null });

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "posting-1" });
  });
});
