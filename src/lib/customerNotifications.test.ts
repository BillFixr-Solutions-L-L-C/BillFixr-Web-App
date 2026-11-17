import { describe, expect, it, vi, beforeEach } from "vitest";
import { customerNotificationMessage, notifyCustomer } from "./customerNotifications";

// A tiny stand-in for the admin client: enough to record what was
// inserted, and to answer the one profile read.
function fakeAdmin({ language = "en", insertError = null as { message: string } | null } = {}) {
  const inserted: Record<string, unknown>[] = [];
  const client = {
    inserted,
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { communication_language: language } }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        return {
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: insertError };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client as unknown as Parameters<typeof notifyCustomer>[0] & { inserted: typeof inserted };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("the language a notice is written in", () => {
  // The same rule the emails follow: communication_language, fixed at
  // registration, not the display cookie they may have flipped since.
  it("writes in the customer's communication language, not English", async () => {
    const admin = fakeAdmin({ language: "es" });
    await notifyCustomer(admin, { userId: "u1", type: "provider_replied" });

    expect(admin.inserted[0].message).toBe("Tu proveedor respondió. Abre tu caso para ver lo que dijo.");
  });

  it("falls back to English when the profile cannot be read", async () => {
    const admin = {
      from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }),
        insert: async () => ({ error: null }),
      }),
    } as unknown as Parameters<typeof notifyCustomer>[0];

    const result = await notifyCustomer(admin, { userId: "u1", type: "letter_sent" });
    expect(result.sent).toBe(1);
  });

  it("has every type in both languages", () => {
    const types = [
      "letter_sent",
      "provider_replied",
      "case_closed_no_response",
      "payment_failed",
    ] as const;
    for (const type of types) {
      for (const language of ["en", "es"] as const) {
        const message = customerNotificationMessage(type, language);
        expect(message.length).toBeGreaterThan(10);
      }
    }
    // The amount-bearing one separately, since it takes a value.
    expect(customerNotificationMessage("settlement_reached", "en", 316.04)).toContain("$316.04");
    expect(customerNotificationMessage("settlement_reached", "es", 316.04)).toContain("316.04");
  });

  it("never leaves the English copy in the Spanish slot", () => {
    const types = ["letter_sent", "provider_replied", "case_closed_no_response", "payment_failed"] as const;
    for (const type of types) {
      expect(customerNotificationMessage(type, "es")).not.toBe(customerNotificationMessage(type, "en"));
    }
  });
});

describe("the settlement notice", () => {
  it("states the reduction as money", async () => {
    const admin = fakeAdmin();
    await notifyCustomer(admin, { userId: "u1", type: "settlement_reached", amount: 316.04 });

    expect(admin.inserted[0].message).toContain("$316.04");
  });

  // The figure is the entire content. A notice saying a provider agreed to
  // reduce the bill by nothing is worse than no notice.
  it("refuses to be written without an amount", () => {
    expect(() => customerNotificationMessage("settlement_reached", "en")).toThrow(/needs an amount/);
  });
});

describe("what it writes", () => {
  it("records the type alongside the message", async () => {
    const admin = fakeAdmin();
    await notifyCustomer(admin, { userId: "u-42", type: "letter_sent" });

    expect(admin.inserted[0]).toMatchObject({ user_id: "u-42", type: "letter_sent" });
  });
});

describe("when it cannot write", () => {
  // The letter has already gone, the case has already advanced, the money
  // has already moved. Throwing here would undo real work over a bell.
  it("reports zero instead of throwing when the insert fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = fakeAdmin({ insertError: { message: "nope" } });

    const result = await notifyCustomer(admin, { userId: "u1", type: "letter_sent" });
    expect(result.sent).toBe(0);
  });

  it("reports zero instead of throwing when the client blows up", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const admin = {
      from: () => {
        throw new Error("connection lost");
      },
    } as unknown as Parameters<typeof notifyCustomer>[0];

    await expect(notifyCustomer(admin, { userId: "u1", type: "letter_sent" })).resolves.toEqual({ sent: 0 });
  });
});
