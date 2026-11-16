import { beforeEach, describe, expect, it, vi } from "vitest";

import { notifyAdmins } from "@/lib/adminNotifications";

type Row = Record<string, unknown>;

// A fake that records the insert and lets each table's rows be set.
function client({
  admins = [{ id: "admin-1" }, { id: "admin-2" }] as Row[],
  roleIds = [{ role_id: "role-full" }] as Row[],
  insertError = null as { message: string } | null,
} = {}) {
  const insert = vi.fn();
  const filters: Record<string, unknown[]> = { eq: [], in: [] };

  const fake = {
    from(table: string) {
      if (table === "notifications") {
        return {
          insert: async (rows: Row[]) => {
            insert(rows);
            return { error: insertError };
          },
        };
      }
      if (table === "role_domain_access") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: roleIds }).then(resolve);
        return chain;
      }
      // profiles
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (...args: unknown[]) => {
        filters.eq.push(args);
        return chain;
      };
      chain.in = (...args: unknown[]) => {
        filters.in.push(args);
        return chain;
      };
      chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: admins }).then(resolve);
      return chain;
    },
  };

  return { client: fake as never, insert, filters };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// Only two things ever wrote to this table: a new support ticket and a
// live chat message — both of them the customer knocking on the door.
// Nothing told the team about a settlement the engine had parked, which
// is a case that cannot finish until someone opens that exact page.
describe("notifyAdmins", () => {
  it("writes one notification per admin", async () => {
    const { client: db, insert } = client();

    const result = await notifyAdmins(db, {
      type: "settlement_held",
      message: "needs review",
      domain: "negotiation",
    });

    expect(result).toEqual({ sent: 2 });
    expect(insert).toHaveBeenCalledWith([
      { user_id: "admin-1", type: "settlement_held", message: "needs review" },
      { user_id: "admin-2", type: "settlement_held", message: "needs review" },
    ]);
  });

  it("narrows to admins with full access to the domain", async () => {
    // A finance admin does not need every negotiation event.
    const { client: db, filters } = client();

    await notifyAdmins(db, { type: "provider_replied", message: "replied", domain: "negotiation" });

    expect(filters.in).toContainEqual(["role_id", ["role-full"]]);
  });

  it("tells every admin when no domain is given", async () => {
    const { client: db, filters } = client();

    await notifyAdmins(db, { type: "case_stalled", message: "stalled", domain: null });

    expect(filters.in).toHaveLength(0);
  });

  it("writes nothing when no role has full access to that domain", async () => {
    const { client: db, insert } = client({ roleIds: [] });

    const result = await notifyAdmins(db, { type: "provider_replied", message: "x", domain: "negotiation" });

    expect(result).toEqual({ sent: 0 });
    expect(insert).not.toHaveBeenCalled();
  });

  it("only tells active admins", async () => {
    const { client: db, filters } = client();

    await notifyAdmins(db, { type: "provider_replied", message: "x", domain: null });

    expect(filters.eq).toContainEqual(["status", "active"]);
    expect(filters.eq).toContainEqual(["role", "admin"]);
  });

  it("never throws when the insert fails", async () => {
    // The case has already advanced and the customer has already been
    // emailed. Failing that work because a bell could not be rung would
    // be the wrong trade every time.
    const { client: db } = client({ insertError: { message: "permission denied" } });

    await expect(
      notifyAdmins(db, { type: "provider_replied", message: "x", domain: null }),
    ).resolves.toEqual({ sent: 0 });
  });

  it("never throws when the client blows up entirely", async () => {
    const exploding = {
      from() {
        throw new Error("connection lost");
      },
    } as never;

    await expect(
      notifyAdmins(exploding, { type: "provider_replied", message: "x", domain: null }),
    ).resolves.toEqual({ sent: 0 });
  });
});
