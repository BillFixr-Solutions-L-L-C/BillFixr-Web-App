import { describe, expect, it } from "vitest";
import { createSupabaseMock } from "@/test/supabaseMock";
import { getDomainAccess, hasDomainAccess, hasFullDomainAccess } from "./domainAccess";

describe("getDomainAccess", () => {
  it("returns the access level from the RPC call", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: "full", error: null });

    const level = await getDomainAccess(mock.client as unknown as Parameters<typeof getDomainAccess>[0], "hr");

    expect(level).toBe("full");
    expect(mock.rpc).toHaveBeenCalledWith("get_domain_access", { p_domain: "hr" });
  });

  it("defaults to 'none' when the RPC returns null", async () => {
    const mock = createSupabaseMock();
    mock.rpc.mockResolvedValue({ data: null, error: null });

    const level = await getDomainAccess(mock.client as unknown as Parameters<typeof getDomainAccess>[0], "finance");

    expect(level).toBe("none");
  });
});

describe("hasDomainAccess", () => {
  it("is false only for 'none'", () => {
    expect(hasDomainAccess("none")).toBe(false);
    expect(hasDomainAccess("full")).toBe(true);
    expect(hasDomainAccess("limited")).toBe(true);
    expect(hasDomainAccess("read_only")).toBe(true);
    expect(hasDomainAccess("flagged_only")).toBe(true);
    expect(hasDomainAccess("assigned_only")).toBe(true);
  });
});

describe("hasFullDomainAccess", () => {
  it("is true only for 'full'", () => {
    expect(hasFullDomainAccess("full")).toBe(true);
    expect(hasFullDomainAccess("limited")).toBe(false);
    expect(hasFullDomainAccess("read_only")).toBe(false);
    expect(hasFullDomainAccess("flagged_only")).toBe(false);
    expect(hasFullDomainAccess("assigned_only")).toBe(false);
    expect(hasFullDomainAccess("none")).toBe(false);
  });
});
