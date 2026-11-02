import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signOutAndRecord } from "./signOut";

const signOut = vi.fn();
const client = { auth: { signOut } } as unknown as SupabaseClient;

beforeEach(() => {
  vi.clearAllMocks();
  signOut.mockResolvedValue({ error: null });
});

describe("signOutAndRecord", () => {
  it("records the logout before ending the session", async () => {
    // Order matters: the route authenticates from the session, so a
    // stamp sent after signOut() would have no session to read.
    const order: string[] = [];
    global.fetch = vi.fn(async () => {
      order.push("record");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    signOut.mockImplementation(async () => {
      order.push("signOut");
      return { error: null };
    });

    await signOutAndRecord(client);

    expect(order).toEqual(["record", "signOut"]);
    expect(global.fetch).toHaveBeenCalledWith("/api/auth/record-logout", {
      method: "POST",
      keepalive: true,
    });
  });

  it("still signs out when the logout could not be recorded", async () => {
    // Offline, or the request cut short by the navigation that follows.
    // Failing to note that someone left must never keep them logged in.
    global.fetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;

    await expect(signOutAndRecord(client)).resolves.toBeUndefined();
    expect(signOut).toHaveBeenCalled();
  });

  it("still signs out when the route answers with an error", async () => {
    global.fetch = vi.fn(async () => new Response("{}", { status: 500 })) as unknown as typeof fetch;

    await signOutAndRecord(client);

    expect(signOut).toHaveBeenCalled();
  });
});
