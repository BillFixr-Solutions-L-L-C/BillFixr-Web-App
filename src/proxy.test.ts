import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock } from "@/test/supabaseMock";

const serverMock = createSupabaseMock();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => serverMock.client),
}));

const { proxy } = await import("./proxy");

function makeRequest(path: string) {
  return new NextRequest(new URL(path, "http://localhost:3000"));
}

const ADMIN_USER = { id: "admin-1" };
const CUSTOMER_USER = { id: "customer-1" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxy (middleware route protection)", () => {
  it("redirects an unauthenticated visitor away from /dashboard", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects an unauthenticated visitor away from /admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(makeRequest("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects an unauthenticated visitor away from /testimonial", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(makeRequest("/testimonial"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("lets an unauthenticated visitor reach a public route", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: null } });
    const res = await proxy(makeRequest("/"));
    expect(res.status).toBe(200);
  });

  it("bounces a non-admin customer away from /admin to /dashboard", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CUSTOMER_USER } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await proxy(makeRequest("/admin"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("lets an admin reach /admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN_USER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    const res = await proxy(makeRequest("/admin"));
    expect(res.status).toBe(200);
  });

  it("redirects a signed-in admin away from /login to /admin", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: ADMIN_USER } });
    serverMock.queueResult("profiles", { data: { role: "admin" }, error: null });
    const res = await proxy(makeRequest("/login"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/admin");
  });

  it("redirects a signed-in customer away from /signup to /dashboard", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CUSTOMER_USER } });
    serverMock.queueResult("profiles", { data: { role: "customer" }, error: null });
    const res = await proxy(makeRequest("/signup"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard");
  });

  it("redirects a customer with an incomplete, non-exempt profile to the completion screen", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CUSTOMER_USER } });
    serverMock.queueResult("profiles", {
      data: { address: null, city: null, postal_code: null, country: null, profile_completion_exempt: false },
      error: null,
    });
    const res = await proxy(makeRequest("/dashboard/case"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/dashboard/settings?complete_profile=1");
  });

  it("does not redirect a customer with a complete profile", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CUSTOMER_USER } });
    serverMock.queueResult("profiles", {
      data: {
        address: "1 Main St",
        city: "Springfield",
        postal_code: "12345",
        country: "USA",
        profile_completion_exempt: false,
      },
      error: null,
    });
    const res = await proxy(makeRequest("/dashboard/case"));
    expect(res.status).toBe(200);
  });

  it("does not redirect a customer with an incomplete but exempt profile", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CUSTOMER_USER } });
    serverMock.queueResult("profiles", {
      data: { address: null, city: null, postal_code: null, country: null, profile_completion_exempt: true },
      error: null,
    });
    const res = await proxy(makeRequest("/dashboard/case"));
    expect(res.status).toBe(200);
  });

  it("never redirects an incomplete profile away from /dashboard/settings itself", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CUSTOMER_USER } });
    serverMock.queueResult("profiles", {
      data: { address: null, city: null, postal_code: null, country: null, profile_completion_exempt: false },
      error: null,
    });
    const res = await proxy(makeRequest("/dashboard/settings"));
    expect(res.status).toBe(200);
  });

  it("never redirects an incomplete profile away from /dashboard/logout", async () => {
    serverMock.getUser.mockResolvedValue({ data: { user: CUSTOMER_USER } });
    serverMock.queueResult("profiles", {
      data: { address: null, city: null, postal_code: null, country: null, profile_completion_exempt: false },
      error: null,
    });
    const res = await proxy(makeRequest("/dashboard/logout"));
    expect(res.status).toBe(200);
  });
});
