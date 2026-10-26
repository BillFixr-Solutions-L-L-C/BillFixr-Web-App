import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailDomainOf, isBlockedEmailDomain } from "./emailDomain";

function clientReturning(result: { data: unknown; error: unknown }) {
  const eq = vi.fn(() => ({ maybeSingle: async () => result }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as unknown as SupabaseClient, eq };
}

describe("emailDomainOf", () => {
  it("lowercases and trims", () => {
    expect(emailDomainOf("  Person@Mailinator.COM ")).toBe("mailinator.com");
  });

  it("returns empty for something without a domain", () => {
    expect(emailDomainOf("not-an-email")).toBe("");
  });
});

describe("isBlockedEmailDomain", () => {
  it("reports a listed domain as blocked", async () => {
    const { client, eq } = clientReturning({ data: { domain: "mailinator.com" }, error: null });
    await expect(isBlockedEmailDomain(client, "a@mailinator.com")).resolves.toBe(true);
    // Looked up lowercased, so MAILINATOR.COM matches the stored row.
    expect(eq).toHaveBeenCalledWith("domain", "mailinator.com");
  });

  it("matches regardless of the case typed", async () => {
    const { eq, client } = clientReturning({ data: { domain: "mailinator.com" }, error: null });
    await isBlockedEmailDomain(client, "A@MAILINATOR.COM");
    expect(eq).toHaveBeenCalledWith("domain", "mailinator.com");
  });

  it("lets an unlisted domain through", async () => {
    const { client } = clientReturning({ data: null, error: null });
    await expect(isBlockedEmailDomain(client, "a@gmail.com")).resolves.toBe(false);
  });

  it("does not block when the lookup itself fails", async () => {
    const { client } = clientReturning({ data: null, error: { message: "offline" } });
    // The trigger still enforces it; refusing a legitimate signup because
    // a query failed would be the worse outcome.
    await expect(isBlockedEmailDomain(client, "a@mailinator.com")).resolves.toBe(false);
  });

  it("does not query at all for a malformed address", async () => {
    const { client } = clientReturning({ data: null, error: null });
    await expect(isBlockedEmailDomain(client, "nope")).resolves.toBe(false);
  });
});
